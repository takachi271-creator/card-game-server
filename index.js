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

  settings:{
    startMoney:100,
    interest:1.1,
    minBet:5
  },

  round:1
};



// =================
// socket登録
// =================

io.on("connection",(socket)=>{

  socket.on("register",(name)=>{
    sockets[name]=socket;
  });

});



// =================
// 破産チェック
// =================

function checkBankrupt(){

  for(let p in game.players){

    if(game.players[p] <= 0 && !game.eliminated[p]){

      game.eliminated[p]=true;

      if(sockets[p]){
        sockets[p].emit("bankrupt");
      }

    }

  }

}



// =================
// 借金成功率
// =================

function getLoanChance(trust){

  if(trust>=100) return 100;
  if(trust>=80) return 80;
  if(trust>=70) return 70;
  if(trust>=50) return 50;
  if(trust>=30) return 30;
  if(trust>=10) return 10;
  if(trust>=1) return 5;

  return 0;

}



// =================
// 参加
// =================

app.post("/join",(req,res)=>{

  const {name}=req.body;

  if(!game.players[name]){

    game.players[name]=game.settings.startMoney;
    game.trust[name]=80;
    game.eliminated[name]=false;

  }

  res.json(game);

});



// =================
// BET
// =================

app.post("/bet",(req,res)=>{

  const {name,amount}=req.body;

  if(game.eliminated[name] && amount>0)
    return res.send("ゲームオーバー");

  if(amount < game.settings.minBet && amount !==0)
    return res.send("最低BET未満");

  const debt = game.loans[name]?.amount || 0;

  const maxBet = game.players[name] + debt;

  if(amount>maxBet)
    return res.send("賭けすぎ");

  const currentBet = game.bets[name] || 0;

  if(amount<currentBet)
    return res.send("BETは減らせません");

  game.bets[name]=amount;

  checkBankrupt();

  res.json(game);

});



// =================
// 借金申請
// =================

app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  if(game.loans[name])
    return res.send("借金返済後に借りてください");

  if(amount<=0)
    return res.send("金額エラー");


  const trust = game.trust[name] || 0;

  const chance = getLoanChance(trust);

  const roll = Math.random()*100;

  if(roll>chance)
    return res.send("通知失敗");


  const candidates =
  Object.keys(game.players).filter(p=>{

    if(p===name) return false;

    if(game.eliminated[p]) return false;

    if(game.players[p] < amount) return false;

    if(game.loans[p]) return false;

    return true;

  });


  if(candidates.length===0)
    return res.send("借金失敗");


  const lender =
  candidates[Math.floor(Math.random()*candidates.length)];

  game.loanRequests[lender]={borrower:name,amount};

  if(sockets[lender]){
    sockets[lender].emit("loanRequest",{borrower:name,amount});
  }

  res.json({lender});

});



// =================
// 借金承認
// =================

app.post("/loan/accept",(req,res)=>{

  const {name}=req.body;

  const request = game.loanRequests[name];

  if(!request)
    return res.send("申請なし");

  const {borrower,amount}=request;

  if(game.players[name] < amount)
    return res.send("貸すお金不足");


  game.players[name]-=amount;
  game.players[borrower]+=amount;

  const repay =
  Math.floor(amount * game.settings.interest);

  game.loans[borrower]={
    lender:name,
    amount:repay
  };

  delete game.loanRequests[name];

  game.trust[name]+=10;
  game.trust[borrower]-=5;

  res.json(game);

});



// =================
// 借金拒否
// =================

app.post("/loan/reject",(req,res)=>{

  const {name}=req.body;

  delete game.loanRequests[name];

  res.json(game);

});



// =================
// 全額返済
// =================

app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;

  const loan=game.loans[name];

  if(!loan)
    return res.send("借金なし");

  if(game.players[name] < loan.amount)
    return res.send("所持金不足");


  game.players[name]-=loan.amount;
  game.players[loan.lender]+=loan.amount;

  delete game.loans[name];

  game.trust[name]+=3;

  checkBankrupt();

  res.json(game);

});



// =================
// 信用換金
// =================

app.post("/trust/exchange",(req,res)=>{

  const {name}=req.body;

  if(game.trust[name] < 30)
    return res.send("信用不足");

  const gain =
  Math.floor(game.settings.startMoney * 0.3);

  game.trust[name]-=30;
  game.players[name]+=gain;

  res.json(game);

});



// =================
// 勝者処理
// =================

app.post("/winner",(req,res)=>{

  const {name}=req.body;

  if(!game.bets[name])
    return res.send("BETしてない");

  let pot=0;

  for(let p in game.bets){

    pot+=game.bets[p];
    game.players[p]-=game.bets[p];

  }

  game.players[name]+=pot;

  checkBankrupt();

  io.emit("turnEnd",{
    winner:name,
    amount:pot,
    round:game.round
  });

  game.bets={};

  game.round++;

  res.json(game);

});



// =================
// 状態
// =================

app.get("/state",(req,res)=>{

  res.json(game);

});



server.listen(3000,()=>{

  console.log("Server running on port 3000");

});
