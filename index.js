const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

/*
 players = 所持金
 bets = 現在の賭け金
 loans = 借金情報
 loanRequests = 承認待ち
*/

let game = {
  players: {},        // { name: money }
  bets: {},           // { name: bet }
  loans: {},          // { borrower:{ lender, amount } }
  loanRequests: {},   // { lender:{ borrower, amount } }

  round: 1,
  multiplier: 1.2,
  minBet: 5,

  interestRate: 0.05  // ⭐ 利息(5%)
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
// 借金申請（ランダム貸し手）
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
// 勝者処理 + 利息のみ支払い
// =====================
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  // ---- 勝敗計算 ----
  for(let p in game.bets){

    if(p===name){
      game.players[p]+=game.bets[p]*game.multiplier;
    }else{
      game.players[p]-=game.bets[p];
    }
  }

  // ---- ⭐ 利息処理 ----
  for(let borrower in game.loans){

    const loan = game.loans[borrower];
    const interest =
      Math.floor(loan.amount * game.interestRate);

    if(game.players[borrower] >= interest){
      // 利息払える
      game.players[borrower]-=interest;
      game.players[loan.lender]+=interest;
    }else{
      // 払えない → 借金増加
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
// 状態確認
// =====================
app.get("/state",(req,res)=>{
  res.json(game);
});


app.listen(3000,()=>{
  console.log("Server running on port 3000");
});
