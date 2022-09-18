import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import type { DeadMansSwitch } from "../../src/types/DeadMansSwitch";
import type { DeadMansSwitch__factory } from "../../src/types/factories/DeadMansSwitch__factory";

function timeout(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const usdPriceFeeds: any = {
  'hardhat': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  'mainnet': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  'rinkeby': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  'polygon-mainnet': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  'polygon-mumbai': '0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada',
};

task("deploy:DeadMansSwitch").setAction(async function (taskArguments: TaskArguments, { ethers, run, network }) {
  const signers: SignerWithAddress[] = await ethers.getSigners();
  const deadMansSwitchFactory: DeadMansSwitch__factory = <DeadMansSwitch__factory>(
    await ethers.getContractFactory("DeadMansSwitch")
  );
  const deadMansSwitch: DeadMansSwitch = <DeadMansSwitch>await deadMansSwitchFactory.connect(signers[0]).deploy(usdPriceFeeds[network.name]);
  await deadMansSwitch.deployed();
  console.log("DeadMansSwitch deployed to: ", deadMansSwitch.address);

  if (network.name !== "hardhat") {
    // Verify contract on Etherscan
    await timeout(60000); // We may have to wait a bit until etherscan can read the contract
    await run("verify:verify", {
      address: deadMansSwitch.address,
      network: network.name,
      constructorArguments: [usdPriceFeeds[network.name]]
    });
  }
});
