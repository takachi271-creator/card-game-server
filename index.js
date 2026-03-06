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
});

});


/* 参加 */

app.post("/join",(req,res)=>{

const {name}=req.body;

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


/* ゲーム設定 */

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

game.round=1;

res.json(game);

});


/* 状態 */

app.get("/state",(req,res)=>{
res.json(game);
});


const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
