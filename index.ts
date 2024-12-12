import dotenv from 'dotenv';
import axios from "axios";
import fs from "fs";

// Load environment variables from .env file
dotenv.config();

const CONFIG = {
    BITQUERY_API_URL: process.env.BITQUERY_API_URL || "https://graphql.bitquery.io",
    BITQUERY_API_KEY: process.env.BITQUERY_API_KEY,
    BATCH_SIZE: 10,
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 300,
} as const;

if (!CONFIG.BITQUERY_API_KEY) {
  throw new Error('BITQUERY_API_KEY environment variable is required');
}

/**
 * Delays execution for specified milliseconds
 * @param ms - Number of milliseconds to delay
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add proper typing for transfer object
interface Transfer {
  sender: { address: string };
  receiver: { address: string };
  block: { timestamp: { time: string } };
}

interface TokenHolder {
  address: string;
  balance: string;
}

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add interfaces for API responses
interface BitqueryResponse {
    data: {
        ethereum: {
            transfers: Transfer[];
        }
    }
}

interface BalanceResponse {
    data: {
        ethereum: {
            address: Array<{
                balances: Array<{
                    value: string;
                }>;
            }>;
        };
    };
}

/**
 * Fetches token balance for a single address with retry mechanism
 * @param address - Ethereum address to check balance for
 * @param tokenAddress - ERC20 token contract address
 * @param attempt - Current retry attempt number (default: 1)
 * @returns Promise resolving to TokenHolder object or null if no balance
 */
const fetchWithRetry = async (address: string, tokenAddress: string, attempt = 1): Promise<TokenHolder | null> => {
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

        const balanceResponse = await axios.post<BalanceResponse>(
            CONFIG.BITQUERY_API_URL,
            { query: balanceQuery },
            { headers: { "X-API-KEY": CONFIG.BITQUERY_API_KEY } }
        );

        // Add null check for response data
        if (!balanceResponse.data?.data?.ethereum?.address?.[0]) {
            console.warn(`No data found for address ${address}`);
            return null;
        }

        const balance = balanceResponse.data.data.ethereum.address[0]?.balances?.[0]?.value;
        if (balance && parseFloat(balance) > 0) {
            return { address, balance };
        }
        return null;

    } catch (error) {
        if (attempt < CONFIG. MAX_RETRIES) {
            const delayMs = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`Retrying address ${address} after ${delayMs}ms (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES})`);
            await sleep(delayMs);
            return fetchWithRetry(address, tokenAddress, attempt + 1);
        }
        console.error(`Failed to fetch balance for ${address} after ${CONFIG.MAX_RETRIES} attempts:`, error);
        return null;
    }
};

/**
 * Processes a batch of addresses to fetch their token balances
 * @param addresses - Array of Ethereum addresses to process
 * @param tokenAddress - ERC20 token contract address
 * @returns Promise resolving to array of TokenHolder objects
 */
const processBatch = async (addresses: string[], tokenAddress: string): Promise<TokenHolder[]> => {
    const results = await Promise.all(
        addresses.map(address => fetchWithRetry(address, tokenAddress))
    );
    return results.filter((result): result is TokenHolder => result !== null);
};

/**
 * Fetches balances for all addresses in batches with rate limiting
 * @param addresses - Array of all Ethereum addresses to check
 * @param tokenAddress - ERC20 token contract address
 * @returns Promise resolving to array of TokenHolder objects
 */
const fetchAllBalances = async (addresses: string[], tokenAddress: string): Promise<TokenHolder[]> => {
    const chunks = Array.from({ length: Math.ceil(addresses.length / CONFIG.BATCH_SIZE) }, (_, i) =>
        addresses.slice(i * CONFIG.BATCH_SIZE, i * CONFIG.BATCH_SIZE + CONFIG.BATCH_SIZE)
    );

    const holders: TokenHolder[] = [];
    
    for (const [index, chunk] of chunks.entries()) {
        console.log(`Processing batch ${index + 1}/${chunks.length}`);
        
        const batchResults = await processBatch(chunk, tokenAddress);
        holders.push(...batchResults);

        if (index < chunks.length - 1) {
            await sleep(CONFIG.BASE_DELAY_MS);
        }
    }

    return holders;
};

/**
 * Main function to fetch and save token holders for a given ERC20 token
 * Retrieves transfer events, extracts unique addresses, checks balances,
 * and saves results to CSV file
 * @param tokenAddress - ERC20 token contract address to analyze
 * @throws Error if token address is invalid or API requests fail
 */
async function getTokenHolders(tokenAddress: string) {
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
    const response = await axios.post(
      CONFIG.BITQUERY_API_URL,
      {
        query,
      },
      {
        headers: {
          "X-API-KEY": CONFIG.BITQUERY_API_KEY,
        },
      }
    );

    console.log(response.data);
    const transfers = response.data.data.ethereum.transfers;
    const allAddresses = new Set<string>();

    // Extract unique holders from the transfer events
    transfers.forEach((transfer: Transfer) => {
      allAddresses.add(transfer.sender.address);
      allAddresses.add(transfer.receiver.address);
    });

    // Update the main function to use the new implementation
    const holdersWithBalance = await fetchAllBalances(Array.from(allAddresses), tokenAddress);
    console.log("Token Holders with Balance > 0:", holdersWithBalance);

    // Write the holders with balance to a CSV file
    const csvContent = "Address,Balance\n" + 
      holdersWithBalance.map(holder => `${holder.address},${holder.balance}`).join("\n"); // Correct CSV format
    fs.writeFileSync("token_holders.csv", csvContent); // Save to CSV file
    console.log("Token holders with balance saved to token_holders.csv");
  } catch (error) {
    if (error instanceof Error) {
        console.error("Error fetching token holders:", {
            message: error.message,
            tokenAddress,
            timestamp: new Date().toISOString()
        });
    }
    throw error; // Re-throw to handle it at a higher level if needed
  }
}

// Example usage: Replace with the specific token address
const tokenAddress = "0x3da3d8cde7b12cd2cbb688e2655bcacd8946399d"; // Replace with the ERC-20 token address
getTokenHolders(tokenAddress);
