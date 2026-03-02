const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

let game = {
  players: {},
  bets: {},
  loans: {},        // 借金 { borrower:{ lender, amount } }
  loanRequests: {}, // { lender:{ borrower, amount } }
  round: 1,
  multiplier: 1.2,
  minBet: 5
};

// ===== 参加 =====
app.post("/join",(req,res)=>{
  const {name}=req.body;

  if(!game.players[name]){
    game.players[name]=100;
  }

  res.json(game);
});


// ===== ベット（借金考慮）=====
app.post("/bet",(req,res)=>{
  const {name,amount}=req.body;

  if(!game.players[name])
    return res.send("未参加");

  let debt = game.loans[name]?.amount || 0;
  const maxBet = game.players[name] + debt;

  if(amount > maxBet)
    return res.send("賭けすぎ");

  if(amount < game.minBet)
    return res.send("最低賭け金不足");

  game.bets[name]=amount;
  res.json(game);
});


// ===== 借金申請 =====
app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  const others =
    Object.keys(game.players)
    .filter(p=>p!==name);

  if(others.length===0)
    return res.send("貸す人なし");

  const lender =
    others[Math.floor(Math.random()*others.length)];

  game.loanRequests[lender]={
    borrower:name,
    amount:amount
  };

  res.json({ lender, amount });
});


// ===== 承認 =====
app.post("/loan/accept",(req,res)=>{

  const {name}=req.body;

  const reqLoan=game.loanRequests[name];
  if(!reqLoan) return res.send("申請なし");

  const {borrower,amount}=reqLoan;

  game.players[name]-=amount;
  game.players[borrower]+=amount;

  game.loans[borrower]={
    lender:name,
    amount:amount
  };

  delete game.loanRequests[name];

  res.json(game);
});


// ===== 拒否 =====
app.post("/loan/reject",(req,res)=>{
  const {name}=req.body;
  delete game.loanRequests[name];
  res.json(game);
});


// ===== 勝者 =====
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  for(let p in game.bets){
    if(p===name){
      game.players[p]+=game.bets[p]*game.multiplier;
    }else{
      game.players[p]-=game.bets[p];
    }
  }

  game.bets={};
  game.round++;

  res.json(game);
});

app.get("/state",(req,res)=>{
  res.json(game);
});

app.listen(3000,()=>{
  console.log("Server running");
});
