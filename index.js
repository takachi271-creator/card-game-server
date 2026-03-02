const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

// ===== デバッグログ =====
app.use((req,res,next)=>{
  console.log("API:", req.method, req.url);
  next();
});

let game = {
  players:{},
  bets:{},
  loans:{},
  loanRequests:{},

  round:1,

  startMoney:100,
  minBet:5,
  interestRate:0.05
};

// =====================
// 参加
// =====================
app.post("/join",(req,res)=>{
  const {name}=req.body;

  if(!game.players[name]){
    game.players[name]=game.startMoney;
  }

  res.json(game);
});


// =====================
// ベット
// =====================
app.post("/bet",(req,res)=>{

  const {name,amount}=req.body;

  if(!game.players[name])
    return res.send("未参加");

  const debt = game.loans[name]?.amount || 0;
  const maxBet = game.players[name] + debt;

  if(amount > maxBet)
    return res.send("賭けすぎ");

  if(amount < game.minBet)
    return res.send("最低賭け金不足");

  game.bets[name]=amount;

  res.json(game);
});


// =====================
// 借金申請
// =====================
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


// =====================
// 借金承認
// =====================
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


// =====================
// 借金拒否
// =====================
app.post("/loan/reject",(req,res)=>{
  const {name}=req.body;
  delete game.loanRequests[name];
  res.json(game);
});


// =====================
// 全額返済
// =====================
app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;

  const loan = game.loans[name];
  if(!loan) return res.send("借金なし");

  if(game.players[name] < loan.amount)
    return res.send("所持金不足");

  game.players[name] -= loan.amount;
  game.players[loan.lender] += loan.amount;

  delete game.loans[name];

  res.json(game);
});


// =====================
// ⭐ 勝者処理（割合倍率）
// =====================
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  let totalPot = 0;

  for(let p in game.bets){
    totalPot += game.bets[p];
    game.players[p] -= game.bets[p];
  }

  const winnerBet = game.bets[name];
  const percent =
    (winnerBet / game.startMoney) * 100;

  let multiplier = 1.2;

  if(percent >= 500) multiplier = 5.0;
  else if(percent >= 200) multiplier = 3.0;
  else if(percent >= 150) multiplier = 2.0;
  else if(percent >= 100) multiplier = 1.9;
  else if(percent >= 75) multiplier = 1.8;
  else if(percent >= 50) multiplier = 1.5;
  else if(percent >= 20) multiplier = 1.4;

  const reward =
    Math.floor(totalPot * multiplier);

  game.players[name] += reward;

  // 利息
  for(let borrower in game.loans){

    const loan = game.loans[borrower];
    const interest =
      Math.floor(loan.amount * game.interestRate);

    if(game.players[borrower] >= interest){
      game.players[borrower]-=interest;
      game.players[loan.lender]+=interest;
    }else{
      loan.amount += interest;
    }
  }

  game.bets={};
  game.round++;

  res.json({
    winner:name,
    percent:Math.floor(percent),
    multiplier,
    pot:totalPot,
    reward,
    players:game.players
  });
});


// =====================
app.get("/state",(req,res)=>{
  res.json(game);
});

app.listen(3000,()=>{
  console.log("Server running on port 3000");
});
