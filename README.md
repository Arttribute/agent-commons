# Agent Commons

Agent Commons is a monorepo for a decentralized ecosystem of collaborative agents. It includes:

- **commons-app**: A Next.js frontend application.
- **commons-api**: A Nest.js backend API.
- **onchain**: A Hardhat project for Ethereum smart contracts.
- **testnet-subgraph**: A Graph Protocol subgraph for indexing and querying blockchain data.

---

## Project Structure

```
agent-commons/
├── apps/
│   ├── commons-app/          # Next.js frontend
│   └── commons-api/          # Nest.js backend API
├── onchain/                  # Hardhat project for smart contracts
│   ├── contracts/            # solidity smart contracts
│   └── testnet-subgraph/         # Graph Protocol subgraph
├── pnpm-workspace.yaml       # Defines PNPM workspace
├── package.json              # Root package.json for shared dependencies
└── README.md                 # Project documentation
```

---

## Getting Started

### Prerequisites

1. **Node.js**: Install Node.js (latest recommended).
   - Check your Node.js version:
     ```bash
     node -v
     ```
2. **PNPM**: Install PNPM globally (used for managing dependencies in the monorepo):
   ```bash
   npm install -g pnpm
   ```
3. **Git**: Ensure Git is installed on your system.

---

### Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd agent-commons
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Set up environment variables**:
   - Copy the `.env` file in the root directory and fill in the required values.
     ```bash
     cp .env.example .env
     ```

---

### Running the Applications

#### **commons-app (Next.js)**

1. Navigate to the `commons-app` directory:

   ```bash
   cd apps/commons-app
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Open your browser and go to:
   ```
   http://localhost:3000
   ```

#### **commons-api (Nest.js)**

1. Navigate to the `commons-api` directory:

   ```bash
   cd apps/commons-api
   ```

2. Start the API in development mode:

   ```bash
   pnpm start:dev
   ```

3. The API will be available at:
   ```
   http://localhost:3001
   ```

#### **onchain (Hardhat)**

1. Navigate to the `onchain` directory:

   ```bash
   cd onchain
   ```

2. Compile the smart contracts:

   ```bash
   pnpm hardhat compile
   ```

3. Run tests for the smart contracts:

   ```bash
   pnpm hardhat test
   ```

4. Start a local Hardhat node:

   ```bash
   pnpm hardhat node
   ```

5. Deploy the contracts (e.g., to a local Hardhat network):
   ```bash
   pnpm hardhat run scripts/deploy.js --network localhost
   ```

#### **testnet-subgraph (The Graph Protocol)**

### Adding Dependencies

#### For a Specific Project

To install a package **only** for a specific app (e.g., `commons-app`):

```bash
pnpm --filter commons-app add <package-name>
```

#### For All Projects

To install a package for **all projects** in the monorepo:

```bash
pnpm add <package-name>
```

---

## Contribution Guide

1. **Create a branch** for your feature:

   ```bash
   git checkout -b feature/<feature-name>
   ```

2. Make your changes and test them thoroughly.

3. **Commit your changes**:

   ```bash
   git add .
   git commit -m "feat: <description of the feature>"
   ```

4. **Push your branch**:

   ```bash
   git push origin feature/<feature-name>
   ```

5. Open a **pull request** and ensure all checks pass.

---

## Deployment

## License

This project is licensed under the [MIT License](LICENSE).

---

## Contact

For questions or issues, feel free to reach out via [GitHub Issues](<repository-url>/issues).

---

Feel free to modify the URLs, environment variable setup, or any specific details to better fit your project’s needs!
