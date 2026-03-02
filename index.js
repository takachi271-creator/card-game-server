const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

let game = {
  players: {},        // 所持金
  bets: {},           // ベット
  loans: {},          // { 借りた人:{ lender, amount } }
  loanRequests: {},   // 承認待ち

  round: 1,
  multiplier: 1.2,
  minBet: 5,
  interestRate: 0.05
};


// =====================
// 参加
// =====================
app.post("/join",(req,res)=>{
  const {name}=req.body;

  if(!game.players[name]){
    game.players[name]=100;
  }

  res.json(game);
});


// =====================
// ベット（借金込み上限）
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
// ⭐ 全額返済（NEW）
// =====================
app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;

  const loan = game.loans[name];
  if(!loan){
    return res.send("借金なし");
  }

  const amount = loan.amount;

  if(game.players[name] < amount){
    return res.send("所持金不足");
  }

  // お金移動
  game.players[name] -= amount;
  game.players[loan.lender] += amount;

  delete game.loans[name];

  res.json(game);
});


// =====================
// 勝者処理 + 利息
// =====================
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  for(let p in game.bets){
    if(p===name){
      game.players[p]+=game.bets[p]*game.multiplier;
    }else{
      game.players[p]-=game.bets[p];
    }
  }

  // 利息処理（元金は減らない）
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

  res.json(game);
});


// =====================
// 利率変更（ホスト用）
// =====================
app.post("/setInterest",(req,res)=>{
  const {rate}=req.body;
  game.interestRate = rate;
  res.json(game);
});


// =====================
app.get("/state",(req,res)=>{
  res.json(game);
});

app.listen(3000,()=>{
  console.log("Server running on port 3000");
});
