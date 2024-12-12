"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
// Load environment variables from .env file
dotenv_1.default.config();
const CONFIG = {
    BITQUERY_API_URL: process.env.BITQUERY_API_URL || "https://graphql.bitquery.io",
    BITQUERY_API_KEY: process.env.BITQUERY_API_KEY,
    BATCH_SIZE: 10,
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 300,
};
if (!CONFIG.BITQUERY_API_KEY) {
    throw new Error('BITQUERY_API_KEY environment variable is required');
}
/**
 * Delays execution for specified milliseconds
 * @param ms - Number of milliseconds to delay
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Fetches token balance for a single address with retry mechanism
 * @param address - Ethereum address to check balance for
 * @param tokenAddress - ERC20 token contract address
 * @param attempt - Current retry attempt number (default: 1)
 * @returns Promise resolving to TokenHolder object or null if no balance
 */
const fetchWithRetry = (address_1, tokenAddress_1, ...args_1) => __awaiter(void 0, [address_1, tokenAddress_1, ...args_1], void 0, function* (address, tokenAddress, attempt = 1) {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const balanceQuery = `
            query {
                ethereum {
                    address(address: {is: "${address}"}) {
                        balances(currency: {is: "${tokenAddress}"}) {
                            value
                        }
                    }
                }
            }
        `;
        const balanceResponse = yield axios_1.default.post(CONFIG.BITQUERY_API_URL, { query: balanceQuery }, { headers: { "X-API-KEY": CONFIG.BITQUERY_API_KEY } });
        // Add null check for response data
        if (!((_d = (_c = (_b = (_a = balanceResponse.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.ethereum) === null || _c === void 0 ? void 0 : _c.address) === null || _d === void 0 ? void 0 : _d[0])) {
            console.warn(`No data found for address ${address}`);
            return null;
        }
        const balance = (_g = (_f = (_e = balanceResponse.data.data.ethereum.address[0]) === null || _e === void 0 ? void 0 : _e.balances) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.value;
        if (balance && parseFloat(balance) > 0) {
            return { address, balance };
        }
        return null;
    }
    catch (error) {
        if (attempt < CONFIG.MAX_RETRIES) {
            const delayMs = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`Retrying address ${address} after ${delayMs}ms (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES})`);
            yield sleep(delayMs);
            return fetchWithRetry(address, tokenAddress, attempt + 1);
        }
        console.error(`Failed to fetch balance for ${address} after ${CONFIG.MAX_RETRIES} attempts:`, error);
        return null;
    }
});
/**
 * Processes a batch of addresses to fetch their token balances
 * @param addresses - Array of Ethereum addresses to process
 * @param tokenAddress - ERC20 token contract address
 * @returns Promise resolving to array of TokenHolder objects
 */
const processBatch = (addresses, tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const results = yield Promise.all(addresses.map(address => fetchWithRetry(address, tokenAddress)));
    return results.filter((result) => result !== null);
});
/**
 * Fetches balances for all addresses in batches with rate limiting
 * @param addresses - Array of all Ethereum addresses to check
 * @param tokenAddress - ERC20 token contract address
 * @returns Promise resolving to array of TokenHolder objects
 */
const fetchAllBalances = (addresses, tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const chunks = Array.from({ length: Math.ceil(addresses.length / CONFIG.BATCH_SIZE) }, (_, i) => addresses.slice(i * CONFIG.BATCH_SIZE, i * CONFIG.BATCH_SIZE + CONFIG.BATCH_SIZE));
    const holders = [];
    for (const [index, chunk] of chunks.entries()) {
        console.log(`Processing batch ${index + 1}/${chunks.length}`);
        const batchResults = yield processBatch(chunk, tokenAddress);
        holders.push(...batchResults);
        if (index < chunks.length - 1) {
            yield sleep(CONFIG.BASE_DELAY_MS);
        }
    }
    return holders;
});
/**
 * Main function to fetch and save token holders for a given ERC20 token
 * Retrieves transfer events, extracts unique addresses, checks balances,
 * and saves results to CSV file
 * @param tokenAddress - ERC20 token contract address to analyze
 * @throws Error if token address is invalid or API requests fail
 */
function getTokenHolders(tokenAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        // Add input validation
        if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            throw new Error('Invalid Ethereum address format');
        }
        const query = `
    query {
      ethereum {
        transfers(
            options: {desc: "block.timestamp.time", limit: 1000} 
            currency: {is: "${tokenAddress}"}
        ) {
          sender {
            address
          }
          receiver {
            address
          }
          block {
            timestamp {
              time
            }
          }
        }
      }
    }
  `;
        try {
            const response = yield axios_1.default.post(CONFIG.BITQUERY_API_URL, {
                query,
            }, {
                headers: {
                    "X-API-KEY": CONFIG.BITQUERY_API_KEY,
                },
            });
            console.log(response.data);
            const transfers = response.data.data.ethereum.transfers;
            const allAddresses = new Set();
            // Extract unique holders from the transfer events
            transfers.forEach((transfer) => {
                allAddresses.add(transfer.sender.address);
                allAddresses.add(transfer.receiver.address);
            });
            // Update the main function to use the new implementation
            const holdersWithBalance = yield fetchAllBalances(Array.from(allAddresses), tokenAddress);
            console.log("Token Holders with Balance > 0:", holdersWithBalance);
            // Write the holders with balance to a CSV file
            const csvContent = "Address,Balance\n" +
                holdersWithBalance.map(holder => `${holder.address},${holder.balance}`).join("\n"); // Correct CSV format
            fs_1.default.writeFileSync("token_holders.csv", csvContent); // Save to CSV file
            console.log("Token holders with balance saved to token_holders.csv");
        }
        catch (error) {
            if (error instanceof Error) {
                console.error("Error fetching token holders:", {
                    message: error.message,
                    tokenAddress,
                    timestamp: new Date().toISOString()
                });
            }
            throw error; // Re-throw to handle it at a higher level if needed
        }
    });
}
// Example usage: Replace with the specific token address
const tokenAddress = "0x3da3d8cde7b12cd2cbb688e2655bcacd8946399d"; // Replace with the ERC-20 token address
getTokenHolders(tokenAddress);
