import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- Telegram Bot Setup ---
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const bot = new Telegraf(botToken);
    
    // Basic handler for all text messages
    bot.on("text", (ctx) => {
      console.log(`Received message from ${ctx.from.username || ctx.from.id}: ${ctx.message.text}`);
      ctx.reply(`I received your message: "${ctx.message.text}"`);
    });

    // Launch the bot
    bot.launch().then(() => {
      console.log("Telegram bot successfully launched!");
    }).catch((err) => {
      console.error("Failed to launch Telegram bot:", err);
    });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.warn("TELEGRAM_BOT_TOKEN is not set. Telegram bot will not be started.");
  }

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- Vite Middleware for Development / Static Serving for Production ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
