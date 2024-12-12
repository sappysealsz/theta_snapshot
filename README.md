# Token Holders Analyzer

A TypeScript application that fetches and analyzes token holders for any ERC-20 token on the Ethereum blockchain using the BitQuery GraphQL API.

## Features

- Fetches the latest 1000 token transfer events
- Identifies unique addresses involved in transfers
- Checks current token balance for each address
- Exports holders with positive balances to CSV
- Parallel processing of balance queries for better performance

## Prerequisites

- Node.js (v12 or higher)
- npm or yarn
- BitQuery API key

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
# or
yarn install
```

## Configuration

The application uses the BitQuery API. You'll need to:

1. Get a BitQuery API key from [https://graphql.bitquery.io](https://graphql.bitquery.io)
2. Replace the `BITQUERY_API_KEY` in .env with your API key

## Usage

1. Modify the `tokenAddress` variable in `index.ts` with your desired ERC-20 token address
2. Run the application:

```bash
npm start
# or
yarn start
```

The script will:
- Fetch token transfer data
- Process holder information
- Generate a `token_holders.csv` file with addresses and balances

## Project Structure

- `index.ts` - Main script for fetching and processing token holder data
- `tsconfig.json` - TypeScript configuration
- `package.json` - Project dependencies and scripts

## Dependencies

- axios: For making HTTP requests to the BitQuery API
- typescript: For TypeScript support
- @types/node: TypeScript definitions for Node.js

## Output

The script generates a CSV file (`token_holders.csv`) with two columns:
- Address: Ethereum address of the token holder
- Balance: Current token balance for the address

## Error Handling

The application includes error handling for API requests and data processing. All errors are logged to the console.

## License

ISC

## Contributing

Feel free to submit issues and pull requests.
