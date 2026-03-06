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
  betHistory:{},
  loans:{},
  loanRequests:{},
  trust:{},
  eliminated:{},
  startMoney:100,
  minBet:5,
  round:1
};

io.on("connection",(socket)=>{

  socket.on("register",(name)=>{
    sockets[name]=socket;
  });

});

app.post("/join",(req,res)=>{

  const {name}=req.body;

  if(!name) return res.send("名前なし");

  if(!game.players[name]){
    game.players[name]=game.startMoney;
    game.trust[name]=80;
    game.eliminated[name]=false;
  }

  res.json(game);

});

app.post("/bet",(req,res)=>{

  const {name,amount}=req.body;

  if(game.eliminated[name])
    return res.send("破産しています");

  const bet = parseInt(amount)||0;

  const debt = game.loans[name]?.amount || 0;

  const maxBet = game.players[name] + debt;

  if(bet>maxBet)
    return res.send("賭けすぎ");

  const currentBet = game.bets[name] || 0;

  if(bet<currentBet)
    return res.send("BETは減らせません");

  game.bets[name]=bet;

  if(!game.betHistory[name]){
    game.betHistory[name]=[];
  }

  if(bet>0){
    game.betHistory[name].push(bet);
  }

  res.json(game);

});

app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  if(game.loans[name])
    return res.send("借金返済後に借りてください");

  const money=parseInt(amount);

  if(!money || money<=0)
    return res.send("金額エラー");

  const players =
  Object.keys(game.players).filter(p=>p!==name && !game.eliminated[p]);

  const lenders =
  players.filter(p=>game.players[p]>=money);

  if(lenders.length===0)
    return res.send("貸せる人なし");

  const lender =
  lenders[Math.floor(Math.random()*lenders.length)];

  game.loanRequests[lender]={borrower:name,amount:money};

  if(sockets[lender]){
    sockets[lender].emit("loanRequest",{borrower:name,amount:money});
  }

  res.json({lender});

});

app.post("/loan/accept",(req,res)=>{

  const {name}=req.body;

  const reqLoan=game.loanRequests[name];

  if(!reqLoan) return res.send("申請なし");

  const {borrower,amount}=reqLoan;

  if(game.players[name] < amount)
    return res.send("貸すお金が足りません");

  game.players[name]-=amount;
  game.players[borrower]+=amount;

  game.loans[borrower]={
    lender:name,
    amount:amount,
    turn:game.round
  };

  delete game.loanRequests[name];

  game.trust[name]+=10;
  game.trust[borrower]-=5;

  res.json(game);

});

app.post("/loan/reject",(req,res)=>{

  const {name}=req.body;

  delete game.loanRequests[name];

  res.json(game);

});

app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;

  const loan=game.loans[name];

  if(!loan) return res.send("借金なし");

  if(game.players[name] < loan.amount)
    return res.send("所持金不足");

  game.players[name]-=loan.amount;
  game.players[loan.lender]+=loan.amount;

  delete game.loans[name];

  game.trust[name]+=3;

  res.json(game);

});

app.post("/trust/exchange",(req,res)=>{

  const {name}=req.body;

  if(game.trust[name] < 30)
    return res.send("信用不足");

  const gain = Math.floor(game.startMoney * 0.3);

  game.trust[name]-=30;
  game.players[name]+=gain;

  res.json(game);

});

app.post("/winner",(req,res)=>{

  const {name}=req.body;

  if(!game.bets[name]){
    return res.send("このプレイヤーはBETしていません");
  }

  let pot=0;

  for(let p in game.bets){

    pot+=game.bets[p];

    game.players[p]-=game.bets[p];

  }

  game.players[name]+=pot;

  io.emit("turnEnd",{
    winner:name,
    amount:pot,
    round:game.round
  });

  game.bets={};
  game.betHistory={};
  game.round++;

  checkBankruptcy();

  res.json(game);

});

function checkBankruptcy(){

  for(let p in game.players){

    if(game.trust[p]<=0)
      game.eliminated[p]=true;

    if(game.players[p]<=0)
      game.eliminated[p]=true;

    if(game.players[p] < game.minBet && !game.loans[p])
      game.eliminated[p]=true;

    const loan=game.loans[p];

    if(loan && game.round - loan.turn >= 30)
      game.eliminated[p]=true;

  }

}

app.get("/state",(req,res)=>{
  res.json(game);
});


const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
  console.log("Server running on port " + PORT);
});
