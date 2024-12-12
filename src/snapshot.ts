import axios from "axios";
import fs from "fs";

// Constants for API configuration and file output
const THETA_API_URL = "https://explorer-api.thetatoken.org/api";
const LIMIT_PER_PAGE = 100;
const OUTPUT_FILE = "token_holders.csv";
const DELAY_MS = 10; // Delay between API calls to prevent rate limiting
const EPSILON = 1e-10;

// Type definitions for API response structure
interface TokenTransaction {
  from: string;
  to: string;
  value: string;
}

interface ApiResponse {
  body: TokenTransaction[];
}

/**
 * Fetches all transactions for a given token address and generates a snapshot of token balances
 * 
 * @param tokenAddress - The Ethereum address of the token contract (must start with '0x' followed by 40 hex characters)
 * @returns Promise<string[]> - Array of unique addresses that have interacted with the token
 * @throws {Error} If the token address format is invalid
 * @throws {Error} If the API rate limit is exceeded
 * @throws {Error} If there are any network or processing errors
 * 
 * @remarks
 * - Writes results to a CSV file (token_balances.csv) with address and balance columns
 * - Filters out dust balances (< 0.0000000001 tokens)
 * - Assumes token has 18 decimals for value conversion
 * - Implements pagination and rate limiting for API calls
 */
export async function getTokenSnapshot(tokenAddress: string): Promise<string[]> {
  // Validate token address format using regex
  if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    throw new Error('Invalid token address format');
  }

  try {
    // Initialize tracking variables
    let pageNumber = 1;
    let hasMoreData = true;
    const uniqueAddresses = new Set<string>();  // Store unique addresses
    const balances: { [key: string]: number } = {};  // Track token balances per address

    // Set up CSV output stream
    const writeStream = fs.createWriteStream(OUTPUT_FILE);
    writeStream.write('Address,Balance\n');

    // Fetch data in pages until no more data is available
    while (hasMoreData) {
      console.log(`Fetching page ${pageNumber}...`);
      
      const response = await axios.get<ApiResponse>(
        `${THETA_API_URL}/token/${tokenAddress}`,
        {
          params: {
            pageNumber,
            limit: LIMIT_PER_PAGE
          }
        }
      );

      if (response.data && response.data.body && response.data.body.length > 0) {
        response.data.body.forEach((tx: TokenTransaction) => {
          // Track unique addresses and update balances
          uniqueAddresses.add(tx.from).add(tx.to);
          
          // Convert token value to standard units (assuming 18 decimals)
          const value = Number(tx.value) / (10 ** 18);
          balances[tx.from] = (balances[tx.from] || 0) - value;  // Deduct from sender
          balances[tx.to] = (balances[tx.to] || 0) + value;      // Add to receiver
        });

        if (response.data.body.length < LIMIT_PER_PAGE) {
          hasMoreData = false;
        } else {
          pageNumber++;
        }

        // Add delay between requests to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      } else {
        hasMoreData = false;
      }
    }

    console.log(`Total unique addresses fetched: ${uniqueAddresses.size}`);

    // Write non-zero balances to CSV file (filtering out dust amounts)
    let numberOfHolders = 0;
    Object.entries(balances)
      .filter(([_, value]) => value > EPSILON)  // Filter out dust balances
      .forEach(([address, balance]) => {
        writeStream.write(`${address},${balance}\n`);
        numberOfHolders++;
      });

    console.log(`Number of holders: ${numberOfHolders}`);
    writeStream.end();
    console.log(`All token balances saved to ${OUTPUT_FILE}`);
    
    return Array.from(uniqueAddresses);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      console.error("API Error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    } else {
      console.error("Error fetching transactions:", error);
    }
    throw error;
  }
}
