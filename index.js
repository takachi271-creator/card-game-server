const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

let sockets = {};

// =================
// ゲーム状態
// =================

let game = {

players:{},
bets:{},
folded:{},

loans:{},
loanRequests:{},

trust:{},
eliminated:{},

online:{},

betHistory:[],
turnHistory:[],

round:1,

startMoney:100,
startTrust:80,
trustCost:30,
exchangeRate:30,
minBet:5,

betEnabled:true

};

// =================
// socket
// =================

io.on("connection",(socket)=>{

socket.on("register",(name)=>{

sockets[name]=socket;
game.online[name]=true;

});

socket.on("disconnect",()=>{

for(let p in sockets){

if(sockets[p]===socket){

game.online[p]=false;

}

}

});

});

// =================
// プレイヤー参加
// =================

app.post("/join",(req,res)=>{

const {name}=req.body;

if(!game.players[name]){

game.players[name]=game.startMoney;
game.trust[name]=game.startTrust;
game.eliminated[name]=false;

}

res.json(game);

});

// =================
// BET
// =================

app.post("/bet",(req,res)=>{

if(!game.betEnabled){
return res.send("BET停止中");
}

const {name,amount}=req.body;

if(game.eliminated[name]){
return res.send("破産");
}

if(amount < game.minBet){
return res.send("最低BET不足");
}

if(amount > game.players[name]){
return res.send("所持金不足");
}

const currentBet = game.bets[name] || 0;

if(amount < currentBet){
return res.send("BETは減らせません");
}

game.bets[name]=amount;

game.betHistory.push({
round:game.round,
name:name,
amount:amount
});

res.json(game);

});

// =================
// BET受付切替
// =================

app.post("/bet/toggle",(req,res)=>{

game.betEnabled=!game.betEnabled;

res.json(game);

});

// =================
// プレイヤー追加
// =================

app.post("/player/add",(req,res)=>{

const {name}=req.body;

if(!name) return res.send("名前なし");

if(!game.players[name]){

game.players[name]=game.startMoney;
game.trust[name]=game.startTrust;
game.eliminated[name]=false;

}

res.json(game);

});

// =================
// プレイヤー削除
// =================

app.post("/player/remove",(req,res)=>{

const {name}=req.body;

delete game.players[name];
delete game.trust[name];
delete game.eliminated[name];

res.json(game);

});

// =================
// ゲーム設定
// =================

app.post("/settings",(req,res)=>{

const {
startMoney,
startTrust,
trustCost,
exchangeRate,
minBet
}=req.body;

if(startMoney!==undefined) game.startMoney=startMoney;
if(startTrust!==undefined) game.startTrust=startTrust;
if(trustCost!==undefined) game.trustCost=trustCost;
if(exchangeRate!==undefined) game.exchangeRate=exchangeRate;
if(minBet!==undefined) game.minBet=minBet;

res.json(game);

});

// =================
// 借金申請
// =================

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body;

if(game.loans[name]){
return res.send("借金返済後に借りてください");
}

const players=Object.keys(game.players).filter(p=>p!==name);

if(players.length===0){
return res.send("貸し手なし");
}

const lender=players[Math.floor(Math.random()*players.length)];

game.loanRequests[lender]={borrower:name,amount};

if(sockets[lender]){
sockets[lender].emit("loanRequest",{borrower:name,amount});
}

res.json({lender});

});

// =================
// 借金承認
// =================

app.post("/loan/accept",(req,res)=>{

const {name}=req.body;

const reqLoan=game.loanRequests[name];

if(!reqLoan) return res.send("申請なし");

const {borrower,amount}=reqLoan;

if(game.players[name] < amount){
return res.send("貸すお金不足");
}

game.players[name]-=amount;
game.players[borrower]+=amount;

game.loans[borrower]={lender:name,amount};

delete game.loanRequests[name];

game.trust[name]+=10;
game.trust[borrower]-=5;

res.json(game);

});

// =================
// 借金拒否
// =================

app.post("/loan/reject",(req,res)=>{

const {name}=req.body;

delete game.loanRequests[name];

res.json(game);

});

// =================
// 返済
// =================

app.post("/loan/repay",(req,res)=>{

const {name}=req.body;

const loan=game.loans[name];

if(!loan) return res.send("借金なし");

if(game.players[name] < loan.amount){
return res.send("所持金不足");
}

game.players[name]-=loan.amount;
game.players[loan.lender]+=loan.amount;

delete game.loans[name];

game.trust[name]+=3;

res.json(game);

});

// =================
// 信用換金
// =================

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body;

if(game.trust[name] < game.trustCost){
return res.send("信用不足");
}

const gain = Math.floor(game.startMoney*(game.exchangeRate/100));

game.trust[name]-=game.trustCost;
game.players[name]+=gain;

res.json(game);

});

// =================
// 勝者
// =================

app.post("/winner",(req,res)=>{

const {name}=req.body;

if(!game.bets[name]){
return res.send("BETしてない");
}

let pot=0;

for(let p in game.bets){

pot+=game.bets[p];
game.players[p]-=game.bets[p];

}

const reward=pot;

game.players[name]+=reward;

game.turnHistory.push({
round:game.round,
winner:name,
amount:reward
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

// =================
// 他ゲー操作
// =================

app.post("/admin/confiscate",(req,res)=>{

const {name}=req.body;

game.players[name]=0;

res.json(game);

});

app.post("/admin/refund",(req,res)=>{

const {name}=req.body;

game.players[name]+=game.bets[name]||0;

res.json(game);

});

app.post("/admin/double",(req,res)=>{

const {name}=req.body;

game.players[name]*=2;

res.json(game);

});

app.post("/admin/triple",(req,res)=>{

const {name}=req.body;

game.players[name]*=3;

res.json(game);

});

// =================
// リセット
// =================

app.post("/reset",(req,res)=>{

game.players={};
game.bets={};
game.loans={};
game.loanRequests={};
game.trust={};
game.eliminated={};
game.betHistory=[];
game.turnHistory=[];
game.round=1;

res.json(game);

});

// =================
// 状態
// =================

app.get("/state",(req,res)=>{
res.json(game);
});

// =================
// サーバー起動
// =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
console.log("Server running on port "+PORT);
});
