const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ⭐ Render対応（これ超重要）
const PORT = process.env.PORT || 3000;

// ゲーム状態
let players = [];
let currentTurn = 1;
let maxTurns = 30;
let gameStarted = false;

app.get("/", (req, res) => {
  res.send("Game Server Running ✅");
});

// 接続
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // プレイヤー登録
  socket.on("register_player", (name) => {
    if (!players.find((p) => p.name === name)) {
      players.push({
        id: socket.id,
        name,
        money: 50,
        credit: 50,
        bet: 0,
      });
      io.emit("update_players", players);
    }
  });

  // 賭け金
  socket.on("place_bet", (amount) => {
    const player = players.find((p) => p.id === socket.id);
    if (player && player.money >= amount) {
      player.bet = amount;
      io.emit("update_players", players);
    }
  });

  // 勝者決定
  socket.on("set_winner", (winnerName) => {
    const winner = players.find((p) => p.name === winnerName);
    if (!winner) return;

    let total = 0;

    players.forEach((p) => {
      total += p.bet;
    });

    players.forEach((p) => {
      if (p.name === winnerName) {
        p.money += total;
      } else {
        p.money -= p.bet;
      }
      p.bet = 0;
    });

    currentTurn++;

    io.emit("update_players", players);
    io.emit("turn_update", currentTurn);

    if (currentTurn > maxTurns) {
      const ranking = [...players].sort((a, b) => b.money - a.money);
      io.emit("game_over", ranking);
    }
  });

  // ゲーム開始
  socket.on("start_game", () => {
    gameStarted = true;
    currentTurn = 1;
    io.emit("game_started", true);
  });

  // 切断
  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("update_players", players);
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});