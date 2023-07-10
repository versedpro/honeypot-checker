import * as dotenv from "dotenv";
dotenv.config();
// Server port
export const port = 8080;

// Max price impact %
export const priceImp = 2;

// Max safe fee
export const maxBuyFee = 10;
export const maxSellFee = 10;

// Chain Id
export const chain_id = process.env.CHAIN_ID;

// Owner address
export const ownerAddress = process.env.OWNER_ADDRESS;

// Http providers
export const BSChttpprovider = process.env.HTTP_PROVIDER_BSC;
export const ETHERhttpprovider = process.env.HTTP_PROVIDER_ETHREUM;
export const GOERLIhttpprovider = process.env.HTTP_PROVIDER_GOERLI;
export const AVAXhttpprovider = process.env.HTTP_PROVIDER_AVAX;
export const FTMhttpprovider = process.env.HTTP_PROVIDER_FTM;
export const MATIChttpprovider = process.env.HTTP_PROVIDER_MATIC;
export const XDAIhttpprovider = process.env.HTTP_PROVIDER_XDAI;

// Multicall addresses
export const BSCaddress = process.env.MULTICAL_ADDRESS_BSC;
export const ETHERaddress = process.env.MULTICAL_ADDRESS_ETHREUM;
export const GOERLIaddress = process.env.MULTICAL_ADDRESS_GOERLI;
export const AVAXaddress = process.env.MULTICAL_ADDRESS_AVAX;
export const FTMaddress = process.env.MULTICAL_ADDRESS_FTM;
export const MATICaddress = process.env.MULTICAL_ADDRESS_MATIC;
export const XDAIaddress = process.env.MULTICAL_ADDRESS_XDAI;
