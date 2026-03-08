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
folded:{},

loans:{},
loanRequests:{},

trust:{},
eliminated:{},
online:{},

betHistory:[],
turnHistory:[],

round:1,
betEnabled:true,

settings:{
startMoney:100,
startTrust:80,
trustCost:30,
exchangeRate:30,
minBet:5
}

}

function createPlayer(name){

game.players[name]=game.settings.startMoney
game.trust[name]=game.settings.startTrust
game.eliminated[name]=false
game.folded[name]=false

}

function checkBankrupt(name){

if(game.players[name]<=0) game.eliminated[name]=true
if(game.trust[name]<=0) game.eliminated[name]=true
if(game.players[name]<game.settings.minBet) game.eliminated[name]=true

}

io.on("connection",(socket)=>{

socket.on("register",(name)=>{
sockets[name]=socket
game.online[name]=true
socket.playerName=name
})

socket.on("disconnect",()=>{
const name=socket.playerName
if(name) game.online[name]=false
})

})

app.post("/join",(req,res)=>{

const {name}=req.body

if(!game.players[name]) createPlayer(name)

res.json(game)

})

app.post("/bet",(req,res)=>{

if(!game.betEnabled) return res.send("BET停止")

const {name,amount}=req.body

if(game.eliminated[name]) return res.send("破産")

let bet=parseInt(amount)||0

if(bet<game.settings.minBet && bet!==0)
return res.send("最低BET")

if(bet>game.players[name])
return res.send("所持金不足")

const current=game.bets[name]||0

if(bet<current)
return res.send("BET減額不可")

game.bets[name]=bet

game.betHistory.push({
round:game.round,
name:name,
amount:bet
})

if(game.betHistory.length>50) game.betHistory.shift()

res.json(game)

})

app.post("/fold",(req,res)=>{

const {name}=req.body
game.folded[name]=true

res.json(game)

})

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body

if(game.loans[name]) return res.send("借金中")

const lenders=Object.keys(game.players)
.filter(p=>p!==name && !game.eliminated[p] && game.players[p]>=amount)

if(lenders.length===0) return res.send("貸せる人なし")

const lender=lenders[Math.floor(Math.random()*lenders.length)]

game.loanRequests[lender]={borrower:name,amount}

if(sockets[lender]){
sockets[lender].emit("loanRequest",{borrower:name,amount})
}

res.json({lender})

})

app.post("/loan/accept",(req,res)=>{

const {name}=req.body
const reqLoan=game.loanRequests[name]

if(!reqLoan) return res.send("申請なし")

const {borrower,amount}=reqLoan

game.players[name]-=amount
game.players[borrower]+=amount

game.loans[borrower]={lender:name,amount}

delete game.loanRequests[name]

game.trust[name]+=10
game.trust[borrower]-=5

res.json(game)

})

app.post("/loan/reject",(req,res)=>{

const {name}=req.body
delete game.loanRequests[name]

res.json(game)

})

app.post("/loan/repay",(req,res)=>{

const {name}=req.body
const loan=game.loans[name]

if(!loan) return res.send("借金なし")

if(game.players[name]<loan.amount)
return res.send("所持金不足")

game.players[name]-=loan.amount
game.players[loan.lender]+=loan.amount

delete game.loans[name]

game.trust[name]+=3

res.json(game)

})

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body

if(game.trust[name]<game.settings.trustCost)
return res.send("信用不足")

const gain=Math.floor(
game.settings.startMoney*(game.settings.exchangeRate/100)
)

game.trust[name]-=game.settings.trustCost
game.players[name]+=gain

res.json(game)

})

app.post("/winner",(req,res)=>{

const {name}=req.body

if(!game.bets[name]){
return res.send("BETなし")
}

let pot=0

for(let p in game.bets){

pot+=game.bets[p]
game.players[p]-=game.bets[p]

}

// 勝者BET
const winnerBet = game.bets[name]

// BET割合
const percent = (winnerBet / game.settings.startMoney) * 100

let multiplier = 1.2

if(percent >= 500) multiplier = 5
else if(percent >= 200) multiplier = 3
else if(percent >= 150) multiplier = 2
else if(percent >= 100) multiplier = 1.9
else if(percent >= 75) multiplier = 1.8
else if(percent >= 50) multiplier = 1.5
else if(percent >= 20) multiplier = 1.4

const reward = Math.floor(pot * multiplier)

game.players[name]+=reward

game.turnHistory.push({
round:game.round,
winner:name,
pot:pot,
reward:reward
})

io.emit("turnEnd",{
winner:name,
amount:reward
})

game.bets={}
game.folded={}

game.round++

for(let p in game.players){

if(game.players[p]<=0){

game.eliminated[p]=true

}

}

res.json(game)

})


game.players[name]+=pot

game.turnHistory.push({
round:game.round,
winner:name,
amount:pot
})

if(game.turnHistory.length>50) game.turnHistory.shift()

io.emit("turnEnd",{winner:name,amount:pot})

game.bets={}
game.folded={}

game.round++

for(let p in game.players){
checkBankrupt(p)
}

res.json(game)

app.post("/bet/toggle",(req,res)=>{
game.betEnabled=!game.betEnabled
res.json(game)
})

app.post("/settings",(req,res)=>{
Object.assign(game.settings,req.body)
res.json(game)
})

app.post("/player/add",(req,res)=>{
const {name}=req.body
if(!game.players[name]) createPlayer(name)
res.json(game)
})

app.post("/player/remove",(req,res)=>{
const {name}=req.body
delete game.players[name]
delete game.trust[name]
delete game.eliminated[name]
res.json(game)
})

app.post("/reset",(req,res)=>{

game.players={}
game.trust={}
game.eliminated={}
game.bets={}
game.loans={}
game.loanRequests={}
game.betHistory=[]
game.turnHistory=[]
game.round=1

res.json(game)

})

app.get("/state",(req,res)=>{
res.json(game)
})



/* 他ゲーム管理 */

app.post("/admin/confiscate",(req,res)=>{
const {name}=req.body
if(game.players[name]!=null) game.players[name]=0
res.json(game)
})

app.post("/admin/refund",(req,res)=>{
const {name}=req.body
if(game.bets[name]) game.players[name]+=game.bets[name]
res.json(game)
})

app.post("/admin/double",(req,res)=>{
const {name}=req.body
if(game.bets[name]) game.players[name]+=game.bets[name]*2
res.json(game)
})

app.post("/admin/triple",(req,res)=>{
const {name}=req.body
if(game.bets[name]) game.players[name]+=game.bets[name]*3
res.json(game)
})


const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{
console.log("Server running on port "+PORT)
})
