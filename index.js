const express = require("express");
app.use(express.static("public"));
const app = express();
app.use(express.json());

let game = {
  players: {},
  bets: {},
  round: 1,
  maxRound: 30,
  multiplier: 1.2,
  minBet: 5,
  started: false
};

// サーバー確認
app.get("/", (req, res) => {
  res.send("ゲーム稼働開始");
});

// 追加
app.get("/join/:name", (req, res) => {
  const name = req.params.name;

  if (!game.players[name]) {
    game.players[name] = 100;
  }

 //この下にbetが来る
  app.get("/bet/:name/:amount", (req, res) => {
  const name = req.params.name;
  const amount = parseInt(req.params.amount);

  if (!game.players[name]) return res.send("未参加");
  if (amount < game.minBet) return res.send("最低賭け金不足");
  if (amount > game.players[name]) return res.send("所持金不足");

  game.bets[name] = amount;

  res.json({ bets: game.bets });
});
  res.json({ players: game.players });
});

//勝者処理
app.get("/winner/:name", (req, res) => {
  const name = req.params.name;

  if (!game.bets[name]) return res.send("その人は賭けてない");

  for (let player in game.bets) {
    if (player === name) {
      game.players[player] += game.bets[player] * game.multiplier;
    } else {
      game.players[player] -= game.bets[player];
    }
  }

  game.bets = {};
  game.round++;

  res.json({
    winner: name,
    players: game.players,
    round: game.round
  });
});

// プレイヤー参加
app.post("/join", (req, res) => {
  const { name } = req.body;

  if (!name) return res.status(400).send("名前必要");

  if (!game.players[name]) {
    game.players[name] = 100;
  }

  res.json({ players: game.players });
});

// ベット
app.post("/bet", (req, res) => {
  const { name, amount } = req.body;

  if (!game.players[name]) return res.status(400).send("未参加");

  if (amount < game.minBet) return res.status(400).send("最低賭け金不足");

  if (amount > game.players[name]) return res.status(400).send("所持金不足");

  game.bets[name] = amount;
  res.json({ bets: game.bets });
});

// 勝者選択（ホスト用）
app.post("/winner", (req, res) => {
  const { name } = req.body;

  if (!game.bets[name]) return res.status(400).send("その人は賭けてない");

  for (let player in game.bets) {
    if (player === name) {
      game.players[player] += game.bets[player] * game.multiplier;
    } else {
      game.players[player] -= game.bets[player];
    }
  }

  game.bets = {};
  game.round++;

  res.json({
    winner: name,
    players: game.players,
    round: game.round
  });
});

// 状態確認
app.get("/state", (req, res) => {
  res.json(game);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});