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

allowedPlayers:[],
online:{},

startMoney:100,
minBet:5,

trustStart:80,
trustCost:30,
trustPercent:0.3,

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


/* プレイヤー追加 */

app.post("/player/add",(req,res)=>{

const {name}=req.body;

if(!game.allowedPlayers.includes(name)){
game.allowedPlayers.push(name);
}

res.json(game);

});


/* 参加 */

app.post("/join",(req,res)=>{

const {name}=req.body;

if(!game.allowedPlayers.includes(name)){
return res.send("登録されていません");
}

if(!game.players[name]){

game.players[name]=game.startMoney;
game.trust[name]=game.trustStart;
game.eliminated[name]=false;
game.betHistory[name]=[];

}

res.json(game);

});


/* BET */

app.post("/bet",(req,res)=>{

const {name,amount}=req.body;

if(!game.betEnabled)
return res.send("BET停止中");

if(game.eliminated[name] && amount>0)
return res.send("ゲームオーバー");

if(amount < game.minBet && amount!==0)
return res.send("最低BET未満");

const currentBet = game.bets[name] || 0;

if(amount < currentBet)
return res.send("BETは減らせません");

if(amount > game.players[name])
return res.send("所持金不足");

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

if(game.loans[name])
return res.send("借金返済後に借りてください");

const players=
Object.keys(game.players)
.filter(p=>p!==name && game.players[p]>=amount);

if(players.length===0)
return res.send("貸せる人なし");

const lender=
players[Math.floor(Math.random()*players.length)];

game.loanRequests[lender]={borrower:name,amount};

if(sockets[lender]){
sockets[lender].emit("loanRequest",{borrower:name,amount});
}

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


/* 信用換金 */

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body;

if(game.trust[name] < game.trustCost)
return res.send("信用不足");

const gain=Math.floor(game.startMoney * game.trustPercent);

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


/* 履歴 */

for(let p in game.bets){

if(!game.betHistory[p])
game.betHistory[p]=[];

game.betHistory[p].push({
round:game.round,
amount:game.bets[p]
});

}

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
game.eliminated={};
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
