import { ethers } from "ethers";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} from "@flashbots/ethers-provider-bundle";
import { exit } from "process";
import dotenv from "dotenv";

const CONTRACT_ADDRESS = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
dotenv.config();

const main = async () => {
  if (
    process.env.SPONSOR_KEY === undefined ||
    process.env.VICTIM_KEY === undefined
  ) {
    console.error("Please set both SPONSOR_KEY and VICTIM_KEY env");
    exit(1);
  }

  // currently assumes local ethereum node. To use node providers, set them in the parentheses (see their docs).
  const provider = new ethers.JsonRpcProvider();

  const authSigner = ethers.Wallet.createRandom();

  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner
  );

  const sponsor = new ethers.Wallet(process.env.SPONSOR_KEY).connect(provider);
  const victim = new ethers.Wallet(process.env.VICTIM_KEY).connect(provider);

  const abi = ["function transferFrom(address from, address to, uint256 tokenId) public"];
  const iface = new ethers.Interface(abi);

  provider.on("block", async (blockNumber) => {
    console.log(blockNumber);
    const targetBlockNumber = blockNumber + 1;
    const rawTx1 = {
      chainId: 1,
      type: 2,
      to: victim.address,
      gasLimit: "21000",
      nonce: 1,
      value: ethers.parseEther("0.0027"),
      maxFeePerGas: ethers.parseUnits("42", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("15", "gwei"),
    };
  
    const rawTx2 = {
      chainId: 1,
      type: 2,
      to: CONTRACT_ADDRESS,
      gasLimit: "64000",
      nonce: 844,
      data: iface.encodeFunctionData("transferFrom", [
        victim.address,
        "0xa4a3a55ce9d87b53684cfd019c406b67d97808d9",
        "0xA91F00627EE9F338CE6200137B04F2C0D49C6B3BABE5A16E5EE7C2AB4BFE3114",
      ]),
      maxFeePerGas: ethers.parseUnits("42", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("15", "gwei"),
    };
  
    const signedTx1 = { signedTransaction: await sponsor.signTransaction(rawTx1) };
    const signedTx2 = { signedTransaction: await victim.signTransaction(rawTx2) };
    const signedBundle = await flashbotsProvider.signBundle([signedTx1, signedTx2]);

    const resp = await flashbotsProvider.sendRawBundle(signedBundle, targetBlockNumber);
    // const resp = await flashbotsProvider.simulate(signedBundle, targetBlockNumber);
    // console.log(resp)

    if ("error" in resp) {
      console.log(resp.error.message);
      return;
    }

    const resolution = await resp.wait();
    if (resolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNumber}`);
      exit(0);
    } else if (resolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
      console.log(`Not included in ${targetBlockNumber}`);
    } else if (resolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log("Nonce too high, bailing");
      exit(1);
    }
  });
};

main();