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
  minBet:5
};

// =====================
// 信用 → 通知成功率
// =====================
function getTrustChance(trust){

  if(trust >= 100) return 1.0;
  if(trust >= 80) return 0.8;
  if(trust >= 70) return 0.7;
  if(trust >= 50) return 0.5;
  if(trust >= 30) return 0.3;
  if(trust >= 10) return 0.1;
  if(trust >= 1)  return 0.05;
  return 0;
}

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
// BET（減額不可）
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
// 借金申請（信用確率）
// =====================
app.post("/loan/request",(req,res)=>{

  const {name,amount}=req.body;

  const others =
    Object.keys(game.players).filter(p=>p!==name);

  if(!others.length)
    return res.send("貸し手なし");

  const chance = getTrustChance(game.trust[name]);

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

  if(game.trust[name] < 30){
    return res.send("信用不足");
  }

  const gain = Math.floor(game.startMoney * 0.3);

  game.trust[name]-=30;
  game.players[name]+=gain;

  res.json(game);
});

// =====================
// 勝者決定
// =====================
app.post("/winner",(req,res)=>{

  const {name}=req.body;

  let pot=0;

  for(let p in game.bets){
    pot+=game.bets[p];
    game.players[p]-=game.bets[p];
  }

  game.players[name]+=pot;

  // 未返済ペナルティ
  for(let borrower in game.loans){

    const loan=game.loans[borrower];

    if(game.players[borrower] < loan.amount){
      game.trust[borrower]-=1;
      game.trust[loan.lender]+=1;
    }
  }

  // 借金なし5ターン回復
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

  res.json(game);
});

// =====================
app.get("/state",(req,res)=>{
  res.json(game);
});

app.listen(3000,()=>{
  console.log("Server running on port 3000");
});
