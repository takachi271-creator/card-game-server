const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

let sockets = {};

let game = {
  players:{},
  bets:{},
  loans:{},
  loanRequests:{},
  trust:{},
  eliminated:{},

  startMoney:100,
  round:1
};

// =======================
// socket接続
// =======================

io.on("connection",(socket)=>{

  socket.on("register",(name)=>{
    sockets[name]=socket;
  });

});

// =======================
// 参加
// =======================

app.post("/join",(req,res)=>{

  const {name}=req.body;

  if(!game.players[name]){

    game.players[name]=game.startMoney;
    game.trust[name]=80;
    game.eliminated[name]=false;

  }

  res.json(game);

});

// =======================
// BET
// =======================

app.post("/bet",(req,res)=>{

  const {name,amount}=req.body;

  if(game.eliminated[name] && amount>0)
    return res.send("ゲームオーバー");

  if(amount<0)
    return res.send("不正BET");

  const debt = game.loans[name]?.amount || 0;

  const maxBet = game.players[name] + debt;

  if(amount>maxBet)
    return res.send("賭けすぎ");

  const currentBet = game.bets[name] || 0;

  if(amount<currentBet)
    return res.send("BETは減らせません");

  game.bets[name]=amount;

  res.json(game);

});

// =======================
// 借金申請
// =======================

app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  const players =
  Object.keys(game.players).filter(p=>p!==name);

  if(players.length===0)
    return res.send("貸し手なし");

  const lender =
  players[Math.floor(Math.random()*players.length)];

  game.loanRequests[lender]={borrower:name,amount};

  if(sockets[lender]){

    sockets[lender].emit("loanRequest",{
      borrower:name,
      amount
    });

  }

  res.json({lender});

});

// =======================
// 借金承認
// =======================

app.post("/loan/accept",(req,res)=>{

  const {name}=req.body;

  const reqLoan=game.loanRequests[name];

  if(!reqLoan) return res.send("申請なし");

  const {borrower,amount}=reqLoan;

  game.players[name]-=amount;
  game.players[borrower]+=amount;

  game.loans[borrower]={
    lender:name,
    amount
  };

  game.trust[borrower]-=5;
  game.trust[name]+=10;

  delete game.loanRequests[name];

  res.json(game);

});

// =======================
// 借金拒否
// =======================

app.post("/loan/reject",(req,res)=>{

  const {name}=req.body;

  delete game.loanRequests[name];

  res.json(game);

});

// =======================
// 返済
// =======================

app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;

  const loan=game.loans[name];

  if(!loan) return res.send("借金なし");

  if(game.players[name]<loan.amount)
    return res.send("所持金不足");

  game.players[name]-=loan.amount;
  game.players[loan.lender]+=loan.amount;

  game.trust[name]+=3;

  delete game.loans[name];

  res.json(game);

});

// =======================
// 信用換金
// =======================

app.post("/trust/exchange",(req,res)=>{

  const {name}=req.body;

  if(game.trust[name]<30)
    return res.send("信用不足");

  const gain=Math.floor(game.startMoney*0.3);

  game.trust[name]-=30;
  game.players[name]+=gain;

  res.json(game);

});

// =======================
// 勝者
// =======================

app.post("/winner",(req,res)=>{

  const {name}=req.body;

  let pot=0;

  for(let p in game.bets){

    pot+=game.bets[p];
    game.players[p]-=game.bets[p];

  }

  game.players[name]+=pot;

  io.emit("winnerNotice",{
    winner:name,
    amount:pot
  });

  game.bets={};

  game.round++;

  res.json(game);

});

// =======================
// 状態
// =======================

app.get("/state",(req,res)=>{
  res.json(game);
});

// =======================

server.listen(3000,()=>{
  console.log("Server running on port 3000");
});
