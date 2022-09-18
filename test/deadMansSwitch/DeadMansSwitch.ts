import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Dead Man's Switch Contract", function () {
  async function deployDeadMansSwitchFixture() {
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const deadMansSwitchFactory = await ethers.getContractFactory("DeadMansSwitch");
    const [owner, addr1, addr2] = await ethers.getSigners();
    const mockV3Aggregator = await mockV3AggregatorFactory.connect(owner).deploy(8, 82491747);
    const deadMansSwitch = await deadMansSwitchFactory.connect(owner).deploy(mockV3Aggregator.address);
    await deadMansSwitch.deployed();
    return { deadMansSwitch, owner, addr1, addr2 };
  }
  describe("Switch Creation", function () {
    it("should return the correct switch data after switch creation", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 10;
      const testFileUrl = "";

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const blockNumber = await ethers.provider.getBlockNumber();

      const [retAddress, retTestCadence, retHeartbeatBlockNo, retFileUrl, retActive] =
        await deadMansSwitch.getSwitchById(switchId);
      expect(retAddress).to.equal(owner.address);
      expect(blockNumber).to.equal(retHeartbeatBlockNo);
      expect(retTestCadence).to.equal(testCadence);
      expect(retFileUrl).to.equal(testFileUrl);
      expect(retActive).to.equal(true);
    });
    it("should emit a mint event", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 10;
      await expect(
        await deadMansSwitch.connect(owner).mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") }),
      ).to.emit(deadMansSwitch, "SwitchMinted");
    });
    it("claim funds", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 10;
      await expect(
        await deadMansSwitch.connect(owner).mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") }),
      ).to.emit(deadMansSwitch, "SwitchMinted");

      const oldBalance = await owner.getBalance();
      const paydayResult = await deadMansSwitch.connect(owner).payday();
      const newBalance = await owner.getBalance();
      const receipt = await paydayResult.wait();
      expect(newBalance.sub(oldBalance).add(receipt.effectiveGasPrice.mul(receipt.cumulativeGasUsed))).to.eq(
        ethers.utils.parseEther("6"),
      );
    });
  });
  describe("Switch Behaviour", function () {
    it("should be alive for the specified amount of blocks", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 10;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const blocksTobeMined = testCadence - 1; // make sure its block is not past endWindow

      for (let index = 0; index < blocksTobeMined; index++) {
        await ethers.provider.send("evm_mine", []);
      } // just mine blocks
      const shouldBeAlive: boolean = await deadMansSwitch.isAlive(switchId);
      expect(shouldBeAlive).to.equal(true);

      const furtherBlocksToBeMined = 2; // make sure block is past endWindow
      for (let index = 0; index < furtherBlocksToBeMined; index++) {
        await ethers.provider.send("evm_mine", []);
      } // just mine blocks
      const shouldBeDead: boolean = await deadMansSwitch.isAlive(switchId);
      expect(shouldBeDead).to.equal(false);
    });
  });
  describe("Hearbeat Function", function () {
    it("should emit an event after heartbeat", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      await expect(await deadMansSwitch.connect(owner).heartbeat(switchId)).to.emit(deadMansSwitch, "HearBeatReceived");
    });
    it("should change the heartbeat block number after heartbeat", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      await deadMansSwitch.connect(owner).heartbeat(switchId); // effect heartbeat
      const blockNumber = await ethers.provider.getBlockNumber();
      const switchInstance1 = await deadMansSwitch.getSwitchForSwitchId(switchId);
      const newHeartbeatBlock = switchInstance1[2];
      expect(newHeartbeatBlock).to.equal(blockNumber);
    });
  });
  describe("Change Owner", function () {
    it("should emit an event after the change of owner", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const newOwner = "0x000000000000000000000000000000000000dEaD";

      await expect(await deadMansSwitch.connect(owner).changeOwner(switchId, newOwner)).to.emit(
        deadMansSwitch,
        "OwnerChanged",
      );
    });
    it("should really change the owner of the switch in question", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const newOwner = "0x000000000000000000000000000000000000dEaD";

      // actually change the owner
      await deadMansSwitch.connect(owner).changeOwner(switchId, newOwner);
      const switchInstance = await deadMansSwitch.getSwitchForSwitchId(switchId);
      const instanceOwner = switchInstance[0];
      expect(instanceOwner).to.equal(newOwner);
    });
  });
  describe("Change Cadence", function () {
    it("should emit an event after the change of cadence", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const newTestCadence = 4;

      await expect(await deadMansSwitch.connect(owner).changeCadence(switchId, newTestCadence)).to.emit(
        deadMansSwitch,
        "ChangedCadence",
      );
    });
    it("should actually change the cadence of the switch in question", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      const newTestCadence = 4;

      // actually change the cadence
      await deadMansSwitch.connect(owner).changeCadence(switchId, newTestCadence);
      const switchInstance = await deadMansSwitch.getSwitchForSwitchId(switchId);
      const newCadence = switchInstance[1];
      expect(newCadence).to.equal(newTestCadence);
    });
  });
  describe("Deactivate Switch", function () {
    it("should emit an event after the change of cadence", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      // deactivate
      await expect(await deadMansSwitch.connect(owner).deactiviateSwitch(switchId)).to.emit(
        deadMansSwitch,
        "SwitchDeactivated",
      );
    });
    it("should be marked as active = false after being deactivated", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      // deactivate
      await deadMansSwitch.connect(owner).deactiviateSwitch(switchId);
      const shouldBeInactive: boolean = await deadMansSwitch.isActive(switchId);
      expect(shouldBeInactive).to.equal(false);
    });
    it("should return an 'always' alive switch after being deactivated", async function () {
      const { deadMansSwitch, owner } = await loadFixture(deployDeadMansSwitchFixture);
      const testCadence = 2;

      const result = await deadMansSwitch
        .connect(owner)
        .mint(owner.address, testCadence, { value: ethers.utils.parseEther("6") });
      const receipt = await result.wait();
      let switchId;

      for (const event of receipt.events!) {
        if (event.event! === "SwitchMinted") switchId = event.args!.switchId;
      }

      // deactivate
      await deadMansSwitch.connect(owner).deactiviateSwitch(switchId);
      // check if correct aliveness is there
      const shouldBeAlive: boolean = await deadMansSwitch.isAlive(switchId);
      expect(shouldBeAlive).to.equal(true);

      // iterate to blocks where deadness would be the case if switch was active
      const furtherBlocksToBeMined = 15; // make sure block is past endWindow
      for (let index = 0; index < furtherBlocksToBeMined; index++) {
        await ethers.provider.send("evm_mine", []);
      } // just mine blocks
      const shouldStillBeAlive: boolean = await deadMansSwitch.isAlive(switchId);
      expect(shouldStillBeAlive).to.equal(true);
    });
  });
});
