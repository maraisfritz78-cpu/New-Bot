# Binance Liquidation Hunter Bot

This project is an automated trading bot that scans the Binance market for potential liquidation events and executes trades based on a configurable strategy. It features a comprehensive Next.js dashboard for real-time monitoring, performance tracking, and strategy management, including an AI-powered optimizer to suggest improvements.

## Features

- **Trading Modes**: Seamlessly switch between **Live Trading** (using real funds) and **Paper Trading** (using a simulated balance on the Binance Testnet).
- **Real-Time Dashboard**: A comprehensive UI to monitor bot status, overall PnL, current balance, and detailed performance statistics like win rate, total trades, and biggest wins/losses.
- **Customizable Strategy**:
    - **Default Strategy**: Define a baseline trading strategy with parameters like risk level, leverage, order size, take-profit (TP), and stop-loss (SL) percentages.
    - **Per-Symbol Overrides**: Fine-tune and apply unique strategies for individual trading pairs, overriding the default settings.
- **AI Strategy Optimizer**: Leverages a generative AI model to analyze your entire trade history. It provides:
    - Human-readable suggestions for strategy adjustments.
    - The reasoning behind its recommendations.
    - Projected 7-day and 30-day PnL based on the suggested changes.
- **Persistent Trade History**: All trades are automatically saved to a local file, ensuring your performance data persists across sessions and provides a rich dataset for AI analysis.
- **Live Market Data**: Monitor real-time prices for your selected symbols directly from the exchange.

## Getting Started

Follow these instructions to get the project running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set Up Environment Variables:**
    The application uses Genkit for its AI features, which requires a Google AI API key.
    - Create a `.env` file in the root of the project.
    - Add your API key to the file:
      ```
      GEMINI_API_KEY=your_google_ai_api_key_here
      ```

4.  **Run the Development Servers:**
    You need to run two separate processes: the Next.js frontend application and the Genkit AI server.

    - **Terminal 1: Run the Next.js App**
      ```bash
      npm run dev
      ```
      This will start the main application, typically available at `http://localhost:9002`.

    - **Terminal 2: Run the Genkit Server**
      ```bash
      npm run genkit:dev
      ```
      This starts the AI server that the Next.js app communicates with for optimization suggestions.

Once both servers are running, you can open your browser to `http://localhost:9002` to view the dashboard.

### Configuring for Live Trading (Optional)

1.  Navigate to the **Settings** tab in the dashboard.
2.  Toggle the mode from "Paper" to "Live".
3.  Enter your live Binance API Key and API Secret into the form. **Note**: These keys are stored in the application's state and are not committed to the repository, but handle them with care.
"# Bybit_Trader" 
