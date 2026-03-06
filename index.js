const express=require("express");
const http=require("http");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);

app.use(express.json());
app.use(express.static("public"));

let sockets={};

let game={

players:{},
bets:{},
loans:{},
loanRequests:{},
trust:{},
eliminated:{},
registeredPlayers:{},
folded:{},

betHistory:[],
turnHistory:[],

settings:{
startMoney:100,
startTrust:80,
trustExchange:30,
trustPercent:0.3,
minBet:5
},

round:1,
betEnabled:true

};

io.on("connection",(socket)=>{

socket.on("register",(name)=>{
sockets[name]=socket;
});

});

function calcMultiplier(bet,startMoney){

const percent=(bet/startMoney)*100;

if(percent>=500)return 5;
if(percent>=200)return 3;
if(percent>=150)return 2;
if(percent>=100)return 1.9;
if(percent>=75)return 1.8;
if(percent>=50)return 1.5;
if(percent>=20)return 1.4;

return 1.2;

}

app.post("/registerPlayer",(req,res)=>{

const {name}=req.body;

game.registeredPlayers[name]=true;

res.json(game);

});

app.post("/join",(req,res)=>{

const {name}=req.body;

if(!game.registeredPlayers[name])
return res.send("登録されていない名前");

if(!game.players[name]){

game.players[name]=game.settings.startMoney;
game.trust[name]=game.settings.startTrust;
game.eliminated[name]=false;

}

res.json(game);

});

app.post("/bet",(req,res)=>{

const {name,amount}=req.body;

if(!game.betEnabled)
return res.send("BET受付停止");

if(game.eliminated[name])
return res.send("破産");

let bet=parseInt(amount)||0;

const current=game.bets[name]||0;

if(bet<current)
return res.send("BETは減らせません");

const debt=game.loans[name]?.amount||0;

const max=game.players[name]+debt;

if(bet>max)
return res.send("賭けすぎ");

game.bets[name]=bet;

game.betHistory.push({
player:name,
bet:bet,
round:game.round
});

res.json(game);

});

app.post("/fold",(req,res)=>{

const {name}=req.body;

game.folded[name]=true;

res.json(game);

});

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body;

if(game.loans[name])
return res.send("借金中");

const trust=game.trust[name]||0;

let chance=0;

if(trust>=100)chance=100;
else if(trust>=80)chance=80;
else if(trust>=70)chance=70;
else if(trust>=50)chance=50;
else if(trust>=30)chance=30;
else if(trust>=10)chance=10;
else if(trust>=1)chance=5;

if(Math.random()*100>chance)
return res.send("借金失敗");

const players=Object.keys(game.players)
.filter(p=>p!==name && game.players[p]>=amount);

if(players.length===0)
return res.send("貸せる人なし");

const lender=players[Math.floor(Math.random()*players.length)];

game.loanRequests[lender]={borrower:name,amount};

if(sockets[lender]){

sockets[lender].emit("loanRequest",{borrower:name,amount});

}

res.json({lender});

});

app.post("/loan/accept",(req,res)=>{

const {name}=req.body;

const reqLoan=game.loanRequests[name];

if(!reqLoan)return res.send("申請なし");

const {borrower,amount}=reqLoan;

if(game.players[name]<amount)
return res.send("貸す金不足");

game.players[name]-=amount;
game.players[borrower]+=amount;

game.loans[borrower]={lender:name,amount,round:game.round};

game.trust[name]+=10;
game.trust[borrower]-=5;

delete game.loanRequests[name];

res.json(game);

});

app.post("/loan/repay",(req,res)=>{

const {name}=req.body;

const loan=game.loans[name];

if(!loan)return res.send("借金なし");

const interest=Math.floor(loan.amount*0.1);

const total=loan.amount+interest;

if(game.players[name]<total)
return res.send("所持金不足");

game.players[name]-=total;
game.players[loan.lender]+=total;

game.trust[name]+=3;

delete game.loans[name];

res.json(game);

});

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body;

if(game.trust[name]<game.settings.trustExchange)
return res.send("信用不足");

const gain=Math.floor(
game.settings.startMoney*game.settings.trustPercent
);

game.trust[name]-=game.settings.trustExchange;
game.players[name]+=gain;

res.json(game);

});

app.post("/winner",(req,res)=>{

const {name}=req.body;

if(!game.bets[name])
return res.send("BETなし");

let pot=0;

for(let p in game.bets){

pot+=game.bets[p];
game.players[p]-=game.bets[p];

}

const mult=calcMultiplier(
game.bets[name],
game.settings.startMoney
);

const reward=Math.floor(pot*mult);

game.players[name]+=reward;

game.turnHistory.push({
round:game.round,
winner:name,
pot:pot,
reward:reward
});

io.emit("turnEnd",{
winner:name,
amount:reward
});

game.bets={};
game.folded={};

game.round++;

for(let p in game.players){

if(game.players[p]<=0){

game.eliminated[p]=true;

}

}

res.json(game);

});
