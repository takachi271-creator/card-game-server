const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

let game = {
  players:{},
  bets:{},
  loans:{},
  loanRequests:{},

  trust:{},
  lastLoanRound:{},

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

  game.trust[name]=80;
  game.lastLoanRound[name]=game.round;

  res.json(game);
});

// =====================
// BET（増額のみ）
// =====================
app.post("/bet",(req,res)=>{

  const {name,amount}=req.body;

  if(amount < game.minBet)
    return res.send("最低賭け金不足");

  const debt = game.loans[name]?.amount || 0;
  const maxBet = game.players[name] + debt;

  if(amount > maxBet)
    return res.send("賭けすぎ");

  const currentBet = game.bets[name] || 0;

  if(amount < currentBet)
    return res.send("ベットは減らせません");

  game.bets[name]=amount;

  res.json(game);
});

// =====================
// 借金申請（信用依存）
// =====================
app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  const others =
    Object.keys(game.players).filter(p=>p!==name);

  if(!others.length)
    return res.send("貸し手なし");

  const trust = game.trust[name] || 80;
  const chance = Math.max(0.1, trust/100);

  if(Math.random() > chance){
    return res.json({failed:true});
  }

  const lender =
    others[Math.floor(Math.random()*others.length)];

  game.loanRequests[lender]={ borrower:name, amount };

  game.trust[name]-=5;
  game.trust[lender]+=10;
  game.lastLoanRound[name]=game.round;

  res.json({lender});
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

  game.loans[borrower]={ lender:name, amount };

  delete game.loanRequests[name];

  res.json(game);
});

// =====================
app.post("/loan/reject",(req,res)=>{
  const {name}=req.body;
  delete game.loanRequests[name];
  res.json(game);
});

// =====================
// 返済
// =====================
app.post("/loan/repay",(req,res)=>{

  const {name}=req.body;
  const loan=game.loans[name];

  if(!loan) return res.send("借金なし");

  if(game.players[name] < loan.amount)
    return res.send("所持金不足");

  game.players[name]-=loan.amount;
  game.players[loan.lender]+=loan.amount;

  game.trust[name]+=3;

  delete game.loans[name];

  res.json(game);
});

// =====================
// 信用 → お金（BET前のみ）
// =====================
app.post("/trust/exchange",(req,res)=>{

  const {name}=req.body;

  if(game.bets[name]){
    return res.send("このターンはもう交換できません");
  }

  if(!game.trust[name] || game.trust[name] < 30){
    return res.send("信用不足");
  }

  const gain = Math.floor(game.startMoney * 0.3);

  game.trust[name] -= 30;
  game.players[name] += gain;

  res.json({
    gained:gain,
    money:game.players[name],
    trust:game.trust[name]
  });
});

// =====================
// 勝者決定
// =====================
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  let totalPot=0;

  for(let p in game.bets){
    totalPot+=game.bets[p];
    game.players[p]-=game.bets[p];
  }

  const winnerBet=game.bets[name];
  const percent=(winnerBet/game.startMoney)*100;

  let multiplier=1.2;
  if(percent>=500) multiplier=5;
  else if(percent>=200) multiplier=3;
  else if(percent>=150) multiplier=2;
  else if(percent>=100) multiplier=1.9;
  else if(percent>=75) multiplier=1.8;
  else if(percent>=50) multiplier=1.5;
  else if(percent>=20) multiplier=1.4;

  const reward=Math.floor(totalPot*multiplier);

  game.players[name]+=reward;

  // ===== 借金未返済ペナルティ =====
  for(let borrower in game.loans){

    const loan=game.loans[borrower];

    if(game.players[borrower] < loan.amount){
      game.trust[borrower]-=1;
      game.trust[loan.lender]+=1;
    }
  }

  // ===== 借金してない人の信用回復 =====
  for(let player in game.players){

    if(!game.loans[player]){

      const last=game.lastLoanRound[player] ?? game.round;

      if(game.round-last>=5){
        game.trust[player]+=5;
        game.lastLoanRound[player]=game.round;
      }
    }
  }

  game.bets={};
  game.round++;

  res.json({
    winner:name,
    reward,
    players:game.players,
    trust:game.trust,
    round:game.round
  });
});

// =====================
app.get("/state",(req,res)=>{
  res.json(game);
});

app.listen(3000,()=>{
  console.log("Server running on port 3000");
});
