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
loanUsed:{},

allowedPlayers:[],
online:{},

startMoney:100,
trustStart:80,
trustCost:30,
trustPercent:0.3,
minBet:5,

round:1,
betEnabled:true

};

io.on("connection",(socket)=>{

socket.on("register",(name)=>{

sockets[name]=socket;
game.online[name]=true;

socket.on("disconnect",()=>{
game.online[name]=false;
});

});

});


function loanChance(trust){

if(trust>=100) return 100;
if(trust>=80) return 80;
if(trust>=70) return 70;
if(trust>=50) return 50;
if(trust>=30) return 30;
if(trust>=10) return 10;
if(trust>=1) return 5;

return 0;

}


/* プレイヤー追加 */

app.post("/player/add",(req,res)=>{

const {name}=req.body;

if(!game.allowedPlayers.includes(name))
game.allowedPlayers.push(name);

res.json(game);

});


/* 参加 */

app.post("/join",(req,res)=>{

const {name}=req.body;

if(!game.allowedPlayers.includes(name))
return res.status(400).json({error:"未登録プレイヤー"});

if(!game.players[name]){

game.players[name]=game.startMoney;
game.trust[name]=game.trustStart;
game.betHistory[name]=[];
game.loanUsed[name]=false;

}

res.json(game);

});


/* BET */

app.post("/bet",(req,res)=>{

const {name,amount}=req.body;

if(!game.betEnabled)
return res.send("BET停止中");

if(amount<game.minBet && amount!==0)
return res.send("最低BET未満");

if(amount>game.players[name])
return res.send("所持金不足");

const currentBet=game.bets[name]||0;

if(amount<currentBet)
return res.send("BETは減らせません");

game.bets[name]=amount;

res.json(game);

});


/* BET切替 */

app.post("/bet/toggle",(req,res)=>{

game.betEnabled=!game.betEnabled;

res.json(game);

});


/* 借金 */

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body;

if(game.loanUsed[name])
return res.send("このラウンドでは借金済み");

const chance=loanChance(game.trust[name]);

if(Math.random()*100>=chance)
return res.send("借金失敗");

const lenders=
Object.keys(game.players)
.filter(p=>p!==name && game.players[p]>=amount);

if(lenders.length===0)
return res.send("貸せる人なし");

const lender=
lenders[Math.floor(Math.random()*lenders.length)];

game.loanUsed[name]=true;

game.loanRequests[lender]={borrower:name,amount};

if(sockets[lender])
sockets[lender].emit("loanRequest",{borrower:name,amount});

res.json({lender});

});


app.post("/loan/accept",(req,res)=>{

const {name}=req.body;

const reqLoan=game.loanRequests[name];

if(!reqLoan) return res.send("申請なし");

const {borrower,amount}=reqLoan;

game.players[name]-=amount;
game.players[borrower]+=amount;

game.loans[borrower]={lender:name,amount};

delete game.loanRequests[name];

game.trust[name]+=10;
game.trust[borrower]-=5;

res.json(game);

});


app.post("/loan/repay",(req,res)=>{

const {name}=req.body;

const loan=game.loans[name];

if(!loan) return res.send("借金なし");

if(game.players[name]<loan.amount)
return res.send("所持金不足");

game.players[name]-=loan.amount;
game.players[loan.lender]+=loan.amount;

delete game.loans[name];

game.trust[name]+=3;

res.json(game);

});


/* 信用換金 */

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body;

if(game.trust[name]<game.trustCost)
return res.send("信用不足");

const gain=Math.floor(game.startMoney*game.trustPercent);

game.trust[name]-=game.trustCost;
game.players[name]+=gain;

res.json(game);

});


/* 勝者 */

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

for(let p in game.bets){

if(!game.betHistory[p])
game.betHistory[p]=[];

game.betHistory[p].push({
round:game.round,
amount:game.bets[p]
});

}

for(let p in game.loanUsed)
game.loanUsed[p]=false;

io.emit("turnEnd",{
winner:name,
amount:pot,
round:game.round
});

game.bets={};
game.round++;

res.json(game);

});


/* 設定 */

app.post("/settings",(req,res)=>{

const {
startMoney,
trustStart,
trustCost,
trustPercent,
minBet
}=req.body;

if(startMoney!==undefined)
game.startMoney=Number(startMoney);

if(trustStart!==undefined)
game.trustStart=Number(trustStart);

if(trustCost!==undefined)
game.trustCost=Number(trustCost);

if(trustPercent!==undefined)
game.trustPercent=Number(trustPercent);

if(minBet!==undefined)
game.minBet=Number(minBet);

res.json(game);

});


/* リセット */

app.post("/reset",(req,res)=>{

game.players={};
game.bets={};
game.betHistory={};
game.loans={};
game.loanRequests={};
game.trust={};
game.loanUsed={};
game.online={};
game.round=1;

res.json(game);

});


app.get("/state",(req,res)=>{
res.json(game);
});


const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
