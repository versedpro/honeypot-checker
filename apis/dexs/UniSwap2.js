// Web3js
import Web3 from "web3";
import {
  priceImp,
  maxBuyFee,
  maxSellFee,
  ETHERaddress,
  GOERLIaddress,
  ownerAddress,
  chain_id,
} from "../../constants/const.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { ETHERprovider, GOERLIprovider } from "../../startConnection.js";

const web3 = new Web3(chain_id === "1" ? ETHERprovider : GOERLIprovider);

const routerAbi = require("../../constants/abis/uniswapV2/router.json");
const tokenAbi = require("../../constants/abis/uniswapV2/token.json");
const multicallAbi = require("../../constants/abis/uniswapV2/multicall.json");

const mainTokenAddress =
  chain_id === "1" ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" : "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6"; // WETH
const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const multicallAddress = chain_id === "1" ? ETHERaddress : GOERLIaddress;
const mainTokentoSell = "0.001";
const maxgas = 2000000;
const minMain = 1;

// Number of tokens with fixed decimals (return a string)
function setDecimals(number, decimals) {
  number = number.toString();
  const numberAbs = number.split(".")[0];
  let numberDecimals = number.split(".")[1] ? number.split(".")[1] : "";
  while (numberDecimals.length < decimals) {
    numberDecimals += "0";
  }
  return numberAbs + numberDecimals;
}

// Honeypot test
async function testHoneypot(
  web3,
  tokenAddress,
  mainTokenAddress,
  routerAddress,
  multicallAddress,
  mainTokentoSell,
  maxgas,
  minMain
) {
  return new Promise(async (resolve) => {
    try {
      // Create contracts
      const mainTokencontract = new web3.eth.Contract(tokenAbi, mainTokenAddress);
      const tokenContract = new web3.eth.Contract(tokenAbi, tokenAddress);
      const routerContract = new web3.eth.Contract(routerAbi, routerAddress);
      const multicallContract = new web3.eth.Contract(multicallAbi, multicallAddress, { from: ownerAddress });

      // Read decimals and symbols
      const mainTokenDecimals = await mainTokencontract.methods.decimals().call();
      const mainTokensymbol = await mainTokencontract.methods.symbol().call();
      const tokenSymbol = await tokenContract.methods.symbol().call();
      const tokenDecimals = await tokenContract.methods.decimals().call();

      // For swaps, 20 minutes from now in time
      const timeStamp = web3.utils.toHex(Math.round(Date.now() / 1000) + 60 * 20);

      // Fixed value of MainTokens to sell
      const mainTokentoSellfixed = setDecimals(mainTokentoSell, mainTokenDecimals);

      // Approve to sell the MainToken in the Dex call
      const approveMainToken = mainTokencontract.methods.approve(
        routerAddress,
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      );

      const approveMainTokenABI = approveMainToken.encodeABI();

      // Swap MainToken to Token call
      const swapMainforTokens = routerContract.methods.swapExactTokensForTokens(
        mainTokentoSellfixed,
        0,
        [mainTokenAddress, tokenAddress],
        multicallAddress,
        timeStamp
      );
      const swapMainforTokensABI = swapMainforTokens.encodeABI();

      const calls = [
        { target: mainTokenAddress, callData: approveMainTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MainToken sell
        { target: routerAddress, callData: swapMainforTokensABI, ethtosell: 0, gastouse: maxgas }, // MainToken -> Token
      ];
      const encodedCalls = calls.map((call) => [call.target, call.callData, call.ethtosell, call.gastouse]);

      // Before running the main multicall
      // Run another multicall that return the number of Tokens expected to receive from the swap (liquidity check also...)
      // We will try to sell half of the expected tokens
      let tokensToSell = null;
      let tokensToSellfixed = null;
      const result = await multicallContract.methods
        .aggregate(encodedCalls)
        .call()
        .catch((err) => console.log(err));

      // If error it means there is not enough liquidity
      let error = false;
      if (result.returnData[0] != "0x00" && result.returnData[1] != "0x00") {
        const receivedTokens =
          web3.eth.abi.decodeLog(
            [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
            result.returnData[1]
          ).amounts[1] *
          10 ** -tokenDecimals;

        // We will try to sell half of the Tokens
        var fixd = tokenDecimals;
        if (fixd > 8) fixd = 8;
        tokensToSell = parseFloat(receivedTokens / 2).toFixed(fixd);
        tokensToSellfixed = setDecimals(tokensToSell, tokenDecimals);
      } else {
        error = true;
      }

      // Honeypot check variable
      let honeypot = false;
      if (!error) {
        // For checking if some problems and extra messages
        let problem = false;
        let extra = null;

        // Approve to sell the MainToken in the Dex call
        const approveMainToken = mainTokencontract.methods.approve(
          routerAddress,
          "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        const approveMainTokenABI = approveMainToken.encodeABI();

        // Swap MainToken to Token call
        const swapMainforTokens = routerContract.methods.swapExactTokensForTokens(
          mainTokentoSellfixed,
          0,
          [mainTokenAddress, tokenAddress],
          multicallAddress,
          timeStamp
        );
        const swapMainforTokensABI = swapMainforTokens.encodeABI();

        // Approve to sell the Token in the Dex call
        const approveToken = tokenContract.methods.approve(
          routerAddress,
          "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        const approveTokenABI = approveToken.encodeABI();

        // Swap Token to MainToken call
        const swapTokensforMain = routerContract.methods.swapExactTokensForTokens(
          tokensToSellfixed,
          0,
          [tokenAddress, mainTokenAddress],
          multicallAddress,
          timeStamp
        );
        const swapTokensforMainABI = swapTokensforMain.encodeABI();

        // Swap Token to MainToken call if the previous one fails
        const swapTokensforMainFees = routerContract.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          tokensToSellfixed,
          0,
          [tokenAddress, mainTokenAddress],
          multicallAddress,
          timeStamp
        );
        const swapTokensforMainFeesABI = swapTokensforMainFees.encodeABI();

        // MainToken Balance call
        const mainTokenBalance = mainTokencontract.methods.balanceOf(multicallAddress);
        const mainTokenBalanceABI = mainTokenBalance.encodeABI();

        // Token Balance call
        const tokenBalance = tokenContract.methods.balanceOf(multicallAddress);
        const tokenBalanceABI = tokenBalance.encodeABI();

        // Expected MainToken from the Token to MainToken swap call
        const amountOut = routerContract.methods.getAmountsOut(tokensToSellfixed, [tokenAddress, mainTokenAddress]);
        const amountOutABI = amountOut.encodeABI();

        // Initial price in MainToken of 1 Token, for calculating price impact
        const amountOutAsk = routerContract.methods.getAmountsOut(setDecimals(1, tokenDecimals), [
          tokenAddress,
          mainTokenAddress,
        ]);
        const amountOutAskABI = amountOutAsk.encodeABI();
        let initialPrice = 0;
        let finalPrice = 0;
        let priceImpact = 0;
        try {
          initialPrice = await amountOutAsk.call();
          initialPrice = initialPrice[1];
        } catch (err) {}

        // Check if Token has Max Transaction amount
        let maxTokenTransaction = null;
        let maxTokenTransactionMain = null;
        try {
          maxTokenTransaction = await tokenContract.methods._maxTxAmount().call();
          maxTokenTransactionMain = await routerContract.methods
            .getAmountsOut(maxTokenTransaction, [tokenAddress, mainTokenAddress])
            .call();
          maxTokenTransactionMain = parseFloat(maxTokenTransactionMain[1] * 10 ** -mainTokenDecimals).toFixed(4);
          maxTokenTransaction = maxTokenTransaction * 10 ** -tokenDecimals;
        } catch (err) {}

        // Calls to run in the multicall
        const calls2 = [
          { target: mainTokenAddress, callData: approveMainTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MainToken sell
          { target: routerAddress, callData: swapMainforTokensABI, ethtosell: 0, gastouse: maxgas }, // MainToken -> Token
          { target: tokenAddress, callData: tokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // Token balance
          { target: tokenAddress, callData: approveTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve Token sell
          { target: routerAddress, callData: swapTokensforMainABI, ethtosell: 0, gastouse: maxgas }, // Token -> MainToken
          { target: mainTokenAddress, callData: mainTokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // MainToken Balance
          { target: routerAddress, callData: amountOutABI, ethtosell: 0, gastouse: maxgas }, // Expected MainToken from the Token to MainToken swap
          { target: routerAddress, callData: swapTokensforMainFeesABI, ethtosell: 0, gastouse: maxgas }, // Token -> MainToken
          { target: mainTokenAddress, callData: mainTokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // MainToken Balance
          { target: routerAddress, callData: amountOutAskABI, ethtosell: 0, gastouse: maxgas }, // Final price of the Token
        ];

        const encodedCalls2 = calls2.map((call) => [call.target, call.callData, call.ethtosell, call.gastouse]);

        // Run the multicall
        const result2 = await multicallContract.methods
          .aggregate(encodedCalls2)
          .call()
          .catch((err) => console.log(err));

        // Variables useful for calculating fees
        let output = 0; // Expected Tokens
        let realOutput = 0; // Obtained Tokens
        let expected = 0; // Expected MainTokens
        let obtained = 0; // Obtained MainTokens
        let buyGas = 0;
        let sellGas = 0;

        // Simulate the steps
        if (result2.returnData[1] != "0x00") {
          output =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result2.returnData[1]
            ).amounts[1] *
            10 ** -tokenDecimals;
          buyGas = result2.gasUsed[1];
        }
        if (result2.returnData[2] != "0x00") {
          realOutput =
            web3.eth.abi.decodeLog([{ internalType: "uint256", name: "", type: "uint256" }], result2.returnData[2])[0] *
            10 ** -tokenDecimals;
        }
        if (result2.returnData[4] != "0x00") {
          obtained =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result2.returnData[4]
            ).amounts[1] *
            10 ** -mainTokenDecimals;
          sellGas = result2.gasUsed[4];
        } else {
          if (result2.returnData[7] != "0x00") {
            obtained = (result2.returnData[8] - result2.returnData[5]) * 10 ** -mainTokenDecimals;
            sellGas = result2.gasUsed[7];
          } else {
            // If so... this is honeypot!
            honeypot = true;
            problem = true;
          }
        }
        if (result2.returnData[6] != "0x00") {
          expected =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result2.returnData[6]
            ).amounts[1] *
            10 ** -mainTokenDecimals;
        }
        if (result2.returnData[9] != "0x00") {
          finalPrice = web3.eth.abi.decodeLog(
            [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
            result2.returnData[9]
          ).amounts[1];
          priceImpact = parseFloat(((finalPrice - initialPrice) / initialPrice) * 100).toFixed(1);
          if (priceImpact > priceImp) {
            problem = true;
            extra =
              "Price change after the swaps is " +
              priceImpact +
              "%, which is really high! (Too high percentages can cause false positives)";
          }
        }

        // Calculate the fees
        const buyTax = ((realOutput - output) / output) * -100;
        const sellTax = ((obtained - expected) / expected) * -100;
        if (buyTax < 0.0) buyTax = 0.0;
        if (sellTax < 0.0) sellTax = 0.0;
        buyTax = parseFloat(buyTax).toFixed(1);
        sellTax = parseFloat(sellTax).toFixed(1);
        if (buyTax > maxBuyFee || sellTax > maxSellFee) {
          problem = true;
        }
        if (maxTokenTransactionMain && maxTokenTransactionMain < minMain) {
          problem = true;
        }

        // Return the result2
        resolve({
          isHoneypot: honeypot,
          buyFee: buyTax,
          sellFee: sellTax,
          buyGas: buyGas,
          sellGas: sellGas,
          maxTokenTransaction: maxTokenTransaction,
          maxTokenTransactionMain: maxTokenTransactionMain,
          tokenSymbol: tokenSymbol,
          mainTokenSymbol: mainTokensymbol,
          priceImpact: priceImpact < 0.0 ? "0.0" : priceImpact,
          problem: problem,
          extra: extra,
        });
      } else {
        resolve({
          isHoneypot: false,
          tokenSymbol: tokenSymbol,
          mainTokenSymbol: mainTokensymbol,
          problem: true,
          liquidity: true,
          extra: "Token liquidity is extremely low or has problems with the purchase!",
        });
      }
    } catch (err) {
      console.log(err);
      if (err.message.includes("Invalid JSON")) {
        resolve({
          error: true,
        });
      } else {
        // Probably the contract is self-destructed
        resolve({
          ExError: true,
          isHoneypot: false,
          tokenSymbol: null,
          mainTokenAddress: mainTokenAddress,
          problem: true,
          extra: "Token probably destroyed itself or does not exist!",
        });
      }
    }
  });
}

// HoneypotPlus test
async function testHoneypotPlus(
  web3,
  tokenAddress,
  mainTokenAddress,
  routerAddress,
  multicallAddress,
  mainTokentoSell,
  maxgas,
  minMain,
  myToken
) {
  return new Promise(async (resolve) => {
    try {
      // Create contracts
      const mainTokencontract = new web3.eth.Contract(tokenAbi, mainTokenAddress);
      const myTokencontract = new web3.eth.Contract(tokenAbi, myToken);
      const tokenContract = new web3.eth.Contract(tokenAbi, tokenAddress);
      const routerContract = new web3.eth.Contract(routerAbi, routerAddress);
      const multicallContract = new web3.eth.Contract(multicallAbi, multicallAddress, { from: ownerAddress });

      // Read decimals and symbols
      const myTokenDecimals = await myTokencontract.methods.decimals().call();
      const mainTokenDecimals = await mainTokencontract.methods.decimals().call();
      const mainTokensymbol = await mainTokencontract.methods.symbol().call();
      const tokenSymbol = await tokenContract.methods.symbol().call();
      const tokenDecimals = await tokenContract.methods.decimals().call();

      // For swaps, 20 minutes from now in time
      const timeStamp = web3.utils.toHex(Math.round(Date.now() / 1000) + 60 * 20);

      // Fixed value of MyToken to sell
      const mainTokentoSellfixed = setDecimals(mainTokentoSell, myTokenDecimals);

      // Approve to sell MyToken in the Dex call
      const approveMyToken = myTokencontract.methods.approve(
        routerAddress,
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      );
      const approveMyTokenABI = approveMyToken.encodeABI();

      // Swap MyToken to MainToken call
      const swapMyforTokens = routerContract.methods.swapExactTokensForTokens(
        mainTokentoSellfixed,
        0,
        [myToken, mainTokenAddress],
        multicallAddress,
        timeStamp
      );
      const swapMyforTokensABI = swapMyforTokens.encodeABI();

      const calls = [
        { target: myToken, callData: approveMyTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MyToken sell
        { target: routerAddress, callData: swapMyforTokensABI, ethtosell: 0, gastouse: maxgas }, // MyToken -> MainToken
      ];

      // Before running the main multicall
      // Run another multicall that return the number of MainToken expected to receive from the swap
      // We will try to sell half of the expected tokens
      let result = await multicallContract.methods
        .aggregate(calls)
        .call()
        .catch((err) => console.log(err));

      let mainTokentoSell2 = 0;
      let mainTokentoSell2fixed = 0;
      if (result.returnData[0] != "0x00" && result.returnData[1] != "0x00") {
        mainTokentoSell2 =
          web3.eth.abi.decodeLog(
            [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
            result.returnData[1]
          ).amounts[1] *
          10 ** -mainTokenDecimals;

        // We will try to sell half of the Tokens
        const fixd = mainTokenDecimals;
        if (fixd > 8) fixd = 8;
        mainTokentoSell2 = parseFloat(mainTokentoSell2 / 2).toFixed(fixd);
        mainTokentoSell2fixed = setDecimals(mainTokentoSell2, mainTokenDecimals);
      }

      // Approve to sell the MainToken in the Dex call
      const approveMainToken = mainTokencontract.methods.approve(
        routerAddress,
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      );
      const approveMainTokenABI = approveMainToken.encodeABI();

      // Swap MainToken to Token call
      const swapMainforTokens = routerContract.methods.swapExactTokensForTokens(
        mainTokentoSell2fixed,
        0,
        [mainTokenAddress, tokenAddress],
        multicallAddress,
        timeStamp
      );
      const firstSwapMainforTokensABI = swapMainforTokens.encodeABI();

      const calls2 = [
        { target: myToken, callData: approveMyTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MyToken sell
        { target: routerAddress, callData: swapMyforTokensABI, ethtosell: 0, gastouse: maxgas }, // MyToken -> MainToken
        { target: mainTokenAddress, callData: approveMainTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MainToken sell
        { target: routerAddress, callData: firstSwapMainforTokensABI, ethtosell: 0, gastouse: maxgas }, // MainToken -> Token
      ];

      // Before running the main multicall
      // Run another multicall that return the number of Tokens expected to receive from the swap (liquidity check also...)
      // We will try to sell half of the expected tokens
      let tokensToSell = null;
      let tokensToSellfixed = null;
      result = await multicallContract.methods
        .aggregate(calls2)
        .call()
        .catch((err) => console.log(err));

      // If error it means there is not enough liquidity
      let error = false;
      if (result.returnData[2] != "0x00" && result.returnData[3] != "0x00") {
        const receivedTokens =
          web3.eth.abi.decodeLog(
            [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
            result.returnData[3]
          ).amounts[1] *
          10 ** -tokenDecimals;

        // We will try to sell half of the Tokens
        const fixd = tokenDecimals;
        if (fixd > 8) fixd = 8;
        tokensToSell = parseFloat(receivedTokens / 2).toFixed(fixd);
        tokensToSellfixed = setDecimals(tokensToSell, tokenDecimals);
      } else {
        error = true;
      }

      // Honeypot check variable
      let honeypot = false;
      if (!error) {
        // Check if some problems and extra messages
        let problem = false;
        let extra = null;

        // Approve to sell the Token in the Dex call
        const approveToken = tokenContract.methods.approve(
          routerAddress,
          "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        const approveTokenABI = approveToken.encodeABI();

        // Swap Token to MainToken call
        const swapTokensforMain = routerContract.methods.swapExactTokensForTokens(
          tokensToSellfixed,
          0,
          [tokenAddress, mainTokenAddress],
          multicallAddress,
          timeStamp
        );
        const swapTokensforMainABI = swapTokensforMain.encodeABI();

        // Swap Token to MainToken call if the previous one fails
        const swapTokensforMainFees = routerContract.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          tokensToSellfixed,
          0,
          [tokenAddress, mainTokenAddress],
          multicallAddress,
          timeStamp
        );
        const swapTokensforMainFeesABI = swapTokensforMainFees.encodeABI();

        // MainToken Balance call
        const mainTokenBalance = mainTokencontract.methods.balanceOf(multicallAddress);
        const mainTokenBalanceABI = mainTokenBalance.encodeABI();

        // Token Balance call
        const tokenBalance = tokenContract.methods.balanceOf(multicallAddress);
        const tokenBalanceABI = tokenBalance.encodeABI();

        // Expected MainToken from the Token to MainToken swap call
        const amountOut = routerContract.methods.getAmountsOut(tokensToSellfixed, [tokenAddress, mainTokenAddress]);
        const amountOutABI = amountOut.encodeABI();

        // Initial price in MainToken of 1 Token, for calculating price impact
        const amountOutAsk = routerContract.methods.getAmountsOut(setDecimals(1, tokenDecimals), [
          tokenAddress,
          mainTokenAddress,
        ]);
        const amountOutAskABI = amountOutAsk.encodeABI();
        let initialPrice = 0;
        let finalPrice = 0;
        let priceImpact = 0;
        try {
          initialPrice = await amountOutAsk.call();
          initialPrice = initialPrice[1];
        } catch (err) {}

        // Check if Token has Max Transaction amount
        let maxTokenTransaction = null;
        let maxTokenTransactionMain = null;
        try {
          maxTokenTransaction = await tokenContract.methods._maxTxAmount().call();
          maxTokenTransactionMain = await routerContract.methods
            .getAmountsOut(maxTokenTransaction, [tokenAddress, mainTokenAddress])
            .call();
          maxTokenTransactionMain = parseFloat(maxTokenTransactionMain[1] * 10 ** -mainTokenDecimals).toFixed(4);
          maxTokenTransaction = maxTokenTransaction * 10 ** -tokenDecimals;
        } catch (err) {}

        // Calls to run in the multicall
        const calls3 = [
          { target: myToken, callData: approveMyTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MyToken sell
          { target: routerAddress, callData: swapMyforTokensABI, ethtosell: 0, gastouse: maxgas }, // MyToken -> MainToken
          { target: mainTokenAddress, callData: approveMainTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve MainToken sell
          { target: routerAddress, callData: firstSwapMainforTokensABI, ethtosell: 0, gastouse: maxgas }, // MainToken -> Token
          { target: tokenAddress, callData: tokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // Token balance
          { target: tokenAddress, callData: approveTokenABI, ethtosell: 0, gastouse: maxgas }, // Approve Token sell
          { target: routerAddress, callData: swapTokensforMainABI, ethtosell: 0, gastouse: maxgas }, // Token -> MainToken
          { target: mainTokenAddress, callData: mainTokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // MainToken Balance
          { target: routerAddress, callData: amountOutABI, ethtosell: 0, gastouse: maxgas }, // Expected MainToken from the Token to MainToken swap
          { target: routerAddress, callData: swapTokensforMainFeesABI, ethtosell: 0, gastouse: maxgas }, // Token -> MainToken
          { target: mainTokenAddress, callData: mainTokenBalanceABI, ethtosell: 0, gastouse: maxgas }, // MainToken Balance
          { target: routerAddress, callData: amountOutAskABI, ethtosell: 0, gastouse: maxgas }, // Final price of the Token
        ];

        // Run the multicall
        const result = await multicallContract.methods
          .aggregate(calls3)
          .call()
          .catch((err) => console.log(err));

        // Variables useful for calculating fees
        let output = 0; // Expected Tokens
        let realOutput = 0; // Obtained Tokens
        let expected = 0; // Expected MainTokens
        let obtained = 0; // Obtained MainTokens
        let buyGas = 0;
        let sellGas = 0;

        // Simulate the steps
        if (result.returnData[3] != "0x00") {
          output =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result.returnData[3]
            ).amounts[1] *
            10 ** -tokenDecimals;
          buyGas = result.gasUsed[3];
        }
        if (result.returnData[4] != "0x00") {
          realOutput =
            web3.eth.abi.decodeLog([{ internalType: "uint256", name: "", type: "uint256" }], result.returnData[4])[0] *
            10 ** -tokenDecimals;
        }
        if (result.returnData[6] != "0x00") {
          obtained =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result.returnData[6]
            ).amounts[1] *
            10 ** -mainTokenDecimals;
          sellGas = result.gasUsed[6];
        } else {
          if (result.returnData[9] != "0x00") {
            obtained = (result.returnData[10] - result.returnData[7]) * 10 ** -mainTokenDecimals;
            sellGas = result.gasUsed[9];
          } else {
            // If so... this is honeypot!
            honeypot = true;
            problem = true;
          }
        }
        if (result.returnData[8] != "0x00") {
          expected =
            web3.eth.abi.decodeLog(
              [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
              result.returnData[8]
            ).amounts[1] *
            10 ** -mainTokenDecimals;
        }
        if (result.returnData[11] != "0x00") {
          finalPrice = web3.eth.abi.decodeLog(
            [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
            result.returnData[11]
          ).amounts[1];
          priceImpact = parseFloat(((finalPrice - initialPrice) / initialPrice) * 100).toFixed(1);
          if (priceImpact > priceImp) {
            problem = true;
            extra =
              "Price change after the swaps is " +
              priceImpact +
              "%, which is really high! (Too high percentages can cause false positives)";
          }
        }

        // Calculate the fees
        var buyTax = ((realOutput - output) / output) * -100;
        var sellTax = ((obtained - expected) / expected) * -100;
        if (buyTax < 0.0) buyTax = 0.0;
        if (sellTax < 0.0) sellTax = 0.0;
        buyTax = parseFloat(buyTax).toFixed(1);
        sellTax = parseFloat(sellTax).toFixed(1);
        if (buyTax > maxBuyFee || sellTax > maxSellFee) {
          problem = true;
        }
        if (maxTokenTransactionMain && maxTokenTransactionMain < minMain) {
          problem = true;
        }

        // Return the result
        resolve({
          isHoneypot: honeypot,
          buyFee: buyTax,
          sellFee: sellTax,
          buyGas: buyGas,
          sellGas: sellGas,
          maxTokenTransaction: maxTokenTransaction,
          maxTokenTransactionMain: maxTokenTransactionMain,
          tokenSymbol: tokenSymbol,
          mainTokenSymbol: mainTokensymbol,
          priceImpact: priceImpact < 0.0 ? "0.0" : priceImpact,
          problem: problem,
          extra: extra,
        });
      } else {
        resolve({
          isHoneypot: false,
          tokenSymbol: tokenSymbol,
          mainTokenSymbol: mainTokensymbol,
          problem: true,
          liquidity: true,
          extra: "Token liquidity is extremely low or has problems with the purchase!",
        });
      }
    } catch (err) {
      if (err.message.includes("Invalid JSON")) {
        resolve({
          error: true,
        });
      } else {
        // Probably the contract is self-destructed
        resolve({
          ExError: true,
          isHoneypot: false,
          tokenSymbol: null,
          mainTokenSymbol: mainTokensymbol,
          problem: true,
          extra: "Token probably destroyed itself or does not exist!",
        });
      }
    }
  });
}

export async function main(req, res) {
  const tokenAddress = req.params.address;
  if (
    `${req.params.address2}`.toLowerCase() == mainTokenAddress.toLowerCase() ||
    `${req.params.address2}`.toLowerCase() == "default"
  ) {
    var honeypot = await testHoneypot(
      web3,
      tokenAddress,
      mainTokenAddress,
      routerAddress,
      multicallAddress,
      mainTokentoSell,
      maxgas,
      minMain
    );
    if (honeypot.error)
      return res.status(403).json({
        error: true,
        msg: "Error testing the honeypot, retry!",
      });
    if (honeypot.ExError)
      return res.status(404).json({
        error: true,
        data: honeypot,
      });
    res.json({
      data: honeypot,
    });
  } else {
    var honeypotPlus = await testHoneypotPlus(
      web3,
      tokenAddress,
      req.params.address2,
      routerAddress,
      multicallAddress,
      mainTokentoSell,
      maxgas,
      minMain,
      mainTokenAddress
    );
    if (honeypotPlus.error)
      return res.status(403).json({
        error: true,
        msg: "Error testing the honeypot, retry!",
      });
    if (honeypotPlus.ExError)
      return res.status(404).json({
        error: true,
        data: honeypotPlus,
      });
    res.json({
      data: honeypotPlus,
    });
  }
}
