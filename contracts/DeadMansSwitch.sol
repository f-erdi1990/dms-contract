// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "hardhat/console.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

error DeadMansSwitchError();

contract DeadMansSwitch is Ownable {
    using SafeMath for uint256;
    uint256 public counter;
    address chief_operator;
    AggregatorV3Interface internal usdPriceFeed;

    struct Switch {
        // signer that can sign heartbeats
        address onlyOwner;
        // specified in blocks after which deadMan is considered dead if no heartbeat was received
        uint256 cadence;
        // specified in blocks after heartbeat where no heartbeat is possible
        uint256 blockHeartbeat;
        // symmetric key from the lit protocol encryption
        string fileUrl;
        // indicates if switch is active
        bool active;
    }

    // Mapping from token ID to owner address
    mapping(uint256 => Switch) private switches;

    // transmit switchId and blockwindows after mint
    event SwitchMinted(uint256 switchId, uint256 blockHeartbeat, address owner);
    // transmit switchId and new blockwindows after hearbeat
    event HearBeatReceived(uint256 switchId, uint256 blockHeartbeat);
    // transmit switchId and new owner
    event OwnerChanged(uint256 switchId, address newOwner);
    // transmit switchId new cadences
    event ChangedCadence(uint256 switchId, uint256 newCadence);
    // tramsmit that switch has been deactivated
    event SwitchDeactivated(uint256 switchId);
    // update symmetric key
    event SwitchUpdated(uint256 switchId);

    /// The dead man's switch has already switched to dead.
    error ManIsUnfortunatelyAlreadyDead();
    /// The dead man's switch is not ready for triggering yet.
    error SwitchNotReadyYet();

    constructor(address _usdPriceFeedAddress) {
        console.log("Deploying the DeadMansSwitch Contract; USD Feed Address:", _usdPriceFeedAddress);
        chief_operator = 0x71093acAdD6Cf1Ef5F8CCf898F2d7fb3F42e151d;
        usdPriceFeed = AggregatorV3Interface(_usdPriceFeedAddress);
    }

    function _getId() private returns (uint256) {
        return counter++;
    }

    function mint(address _onlyOwner, uint256 _cadence) external payable returns (uint256) {
        Switch memory mySwitch = Switch({
            onlyOwner: _onlyOwner,
            cadence: _cadence,
            blockHeartbeat: block.number,
            fileUrl: "",
            active: true
        });
        uint256 switchId = _getId();
        require(!_exists(switchId), "Dead Man's Switch: Switch already minted");
        uint256 cost = 6 * 10**18;
        if (msg.sender == owner() || msg.sender == chief_operator) {
            cost = 0;
        }
        // console.log("Successful mint of switch id ", msg.value);
        require(
            msg.value >= cost,
            string.concat("You need to at least send ", Strings.toString(cost), ",", Strings.toString(msg.value))
        );
        switches[switchId] = mySwitch;
        console.log("Successful mint of switch id ", switchId);
        emit SwitchMinted(switchId, switches[switchId].blockHeartbeat, _onlyOwner);
        emit OwnerChanged(switchId, msg.sender);
        return switchId;
    }

    function payday() external onlyOwner {
        uint256 funds = address(this).balance;
        address payable recipient = payable(owner());
        recipient.transfer(funds);
    }

    function update(uint256 _switchId, string calldata _fileUrl) external returns (bool) {
        require(_exists(_switchId), "Dead Man's Switch: Switch does not excist");
        require(msg.sender == switches[_switchId].onlyOwner, "Dead Man Switch: Wrong Dead Man");
        switches[_switchId].fileUrl = _fileUrl;
        emit SwitchUpdated(_switchId);
        return true;
    }

    function _exists(uint256 _switchId) internal view returns (bool) {
        if (switches[_switchId].onlyOwner != address(0)) {
            return true;
        }
        return false;
    }

    function heartbeat(uint256 _switchId) external returns (bool) {
        require(msg.sender == switches[_switchId].onlyOwner, "Dead Man Switch: Wrong Dead Man");
        bool alive = isAlive(_switchId);
        if (alive == false) {
            revert ManIsUnfortunatelyAlreadyDead();
        } else {
            switches[_switchId].blockHeartbeat = block.number;
            console.log("Successful heartbeat for switch:", _switchId);
            emit HearBeatReceived(_switchId, switches[_switchId].blockHeartbeat);
            return true;
        }
    }

    function changeOwner(uint256 _switchId, address _newOwner) external returns (bool) {
        require(msg.sender == switches[_switchId].onlyOwner, "Dead Man Switch: Wrong Dead Man");
        bool alive = isAlive(_switchId);
        if (alive == false) {
            revert ManIsUnfortunatelyAlreadyDead();
        } else {
            switches[_switchId].onlyOwner = _newOwner;
            console.log("Successful change of owner to new owner:", switches[_switchId].onlyOwner);
            emit OwnerChanged(_switchId, switches[_switchId].onlyOwner);
            return true;
        }
    }

    function changeCadence(uint256 _switchId, uint256 _newCadence) external returns (bool) {
        require(msg.sender == switches[_switchId].onlyOwner, "Dead Man Switch: Wrong Dead Man");
        bool alive = isAlive(_switchId);
        if (alive == false) {
            revert ManIsUnfortunatelyAlreadyDead();
        } else {
            switches[_switchId].cadence = _newCadence;
            console.log("Successful change of cadences to", switches[_switchId].cadence);
            emit ChangedCadence(_switchId, switches[_switchId].cadence);
            return true;
        }
    }

    function deactiviateSwitch(uint256 _switchId) external returns (bool) {
        require(msg.sender == switches[_switchId].onlyOwner, "Dead Man Switch: Wrong Dead Man");
        bool alive = isAlive(_switchId);
        if (alive == false) {
            revert ManIsUnfortunatelyAlreadyDead();
        } else {
            switches[_switchId].active = false;
            console.log("Switch has been deactivated, new status", switches[_switchId].active);
            emit SwitchDeactivated(_switchId);
            return true;
        }
    }

    /**
     * Returns the latest price in usd
     */
    function getUSD() public view returns (uint256) {
        (
            ,
            /*uint80 roundID*/
            int256 price, /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
            ,
            ,

        ) = usdPriceFeed.latestRoundData();
        return uint256(price);
    }

    /**
     * Returns the latest price in usd
     */
    function getMintPrice() public view returns (uint256) {
        uint256 cost = uint256(5).div(getUSD());
        return cost;
    }

    function isActive(uint256 _switchId) public view returns (bool) {
        bool active = switches[_switchId].active;
        return active;
    }

    function isAlive(uint256 _switchId) public view returns (bool) {
        bool alive = true;
        uint256 blockNo = block.number;
        uint256 endWindowBlock = switches[_switchId].blockHeartbeat + switches[_switchId].cadence;
        bool active = switches[_switchId].active;
        if (active == true && blockNo > endWindowBlock) alive = false;
        return alive;
    }

    function getBlock() internal view returns (uint256) {
        uint256 blockNo = block.number;
        return blockNo;
    }

    // deprecated: use getSwitchById instead
    function getSwitchForSwitchId(uint256 _switchId) public view returns (Switch memory) {
        return switches[_switchId];
    }

    function getSwitchById(uint256 _switchId) public view returns (Switch memory) {
        return switches[_switchId];
    }
}
