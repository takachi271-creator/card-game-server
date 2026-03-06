const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static("public"))

let sockets = {}

let game = {

players:{},
bets:{},
betHistory:[],
turnHistory:[],

folded:{},

loans:{},
loanRequests:{},

trust:{},
loanUsed:{},

eliminated:{},

allowedPlayers:[],
online:{},

settings:{
startMoney:100,
startTrust:80,
trustExchange:30,
trustPercent:0.3,
minBet:5
},

betEnabled:true,
round:1

}

io.on("connection",(socket)=>{

socket.on("register",(name)=>{
sockets[name]=socket
game.online[name]=true
})

socket.on("disconnect",()=>{
for(let p in sockets){
if(sockets[p]===socket){
game.online[p]=false
}
}
})

})

app.post("/join",(req,res)=>{

const {name}=req.body

if(!game.allowedPlayers.includes(name))
return res.send("登録されていない名前")

if(!game.players[name]){

game.players[name]=game.settings.startMoney
game.trust[name]=game.settings.startTrust
game.eliminated[name]=false
game.loanUsed[name]=false

}

res.json(game)

})

app.post("/bet",(req,res)=>{

const {name,amount}=req.body

if(!game.betEnabled)
return res.send("BET停止中")

if(game.eliminated[name])
return res.send("破産")

const current = game.bets[name] || 0

if(amount<current)
return res.send("BETは減らせません")

const max = game.players[name] + (game.loans[name]?.amount || 0)

if(amount>max)
return res.send("賭けすぎ")

game.bets[name]=amount

game.betHistory.push({
player:name,
bet:amount,
round:game.round
})

res.json(game)

})

app.post("/fold",(req,res)=>{

const {name}=req.body

game.folded[name]=true

res.json(game)

})

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body

if(game.loanUsed[name])
return res.send("このラウンド借金済み")

if(game.loans[name])
return res.send("借金中")

let lenders =
Object.keys(game.players)
.filter(p=>p!==name && game.players[p]>=amount)

if(lenders.length===0)
return res.send("貸せる人なし")

const lender =
lenders[Math.floor(Math.random()*lenders.length)]

game.loanRequests[lender]={borrower:name,amount}

let trust=game.trust[name]||0
let chance=0

if(trust>=100) chance=100
else if(trust>=80) chance=80
else if(trust>=70) chance=70
else if(trust>=50) chance=50
else if(trust>=30) chance=30
else if(trust>=10) chance=10
else if(trust>=1) chance=5

if(Math.random()*100>chance){
return res.send("借金通知失敗")
}

if(sockets[lender]){
sockets[lender].emit("loanRequest",{borrower:name,amount})
}

game.loanUsed[name]=true

res.json({lender})

})

app.post("/loan/accept",(req,res)=>{

const {name}=req.body

const reqLoan=game.loanRequests[name]

if(!reqLoan) return res.send("申請なし")

const {borrower,amount}=reqLoan

if(game.players[name]<amount)
return res.send("貸す金不足")

game.players[name]-=amount
game.players[borrower]+=amount

game.loans[borrower]={lender:name,amount,round:game.round}

game.trust[name]+=10
game.trust[borrower]-=5

delete game.loanRequests[name]

res.json(game)

})

app.post("/loan/repay",(req,res)=>{

const {name}=req.body

const loan=game.loans[name]

if(!loan) return res.send("借金なし")

const interest=Math.ceil(loan.amount*0.1)
const total=loan.amount+interest

if(game.players[name]<total)
return res.send("返済不可")

game.players[name]-=total
game.players[loan.lender]+=total

delete game.loans[name]

game.trust[name]+=3

res.json(game)

})

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body

if(game.trust[name]<game.settings.trustExchange)
return res.send("信用不足")

const gain =
Math.floor(game.settings.startMoney*game.settings.trustPercent)

game.trust[name]-=game.settings.trustExchange
game.players[name]+=gain

res.json(game)

})

app.post("/winner",(req,res)=>{

const {name}=req.body

if(game.folded[name])
return res.send("降りている")

if(!game.bets[name])
return res.send("BETなし")

let pot=0

for(let p in game.bets){

pot+=game.bets[p]
game.players[p]-=game.bets[p]

}

game.players[name]+=pot

game.turnHistory.push({
round:game.round,
winner:name,
pot:pot
})

io.emit("turnEnd",{winner:name,amount:pot})

game.bets={}
game.folded={}
game.loanUsed={}

game.round++

for(let p in game.players){

if(game.players[p]<=0)
game.eliminated[p]=true

}

res.json(game)

})

app.post("/host/addPlayer",(req,res)=>{

const {name}=req.body

if(!game.allowedPlayers.includes(name))
game.allowedPlayers.push(name)

res.json(game)

})

app.post("/host/reset",(req,res)=>{

game.players={}
game.bets={}
game.betHistory=[]
game.turnHistory=[]
game.folded={}
game.loans={}
game.loanRequests={}
game.trust={}
game.loanUsed={}
game.eliminated={}
game.online={}
game.round=1

res.json(game)

})

app.post("/bet/result",(req,res)=>{

const {name,type}=req.body

const bet = game.bets[name] || 0

if(type==="confiscate"){
game.bets[name]=0
}

if(type==="return"){
game.players[name]+=bet
game.bets[name]=0
}

if(type==="double"){
game.players[name]+=bet*2
game.bets[name]=0
}

if(type==="triple"){
game.players[name]+=bet*3
game.bets[name]=0
}

res.json(game)

})

app.get("/state",(req,res)=>{
res.json(game)
})

const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{
console.log("Server running")
})
