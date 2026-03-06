const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static("public"))

const PORT = process.env.PORT || 3000

// ソケット
let sockets = {}

// ゲーム状態
let game = {

players:{},
bets:{},
folded:{},

betHistory:[],
turnHistory:[],

loans:{},
loanRequests:{},
loanUsed:{},

trust:{},

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

// ============================
// 接続
// ============================

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

// ============================
// 倍率計算
// ============================

function calcMultiplier(bet,start){

const percent = (bet/start)*100

if(percent>=500) return 5
if(percent>=200) return 3
if(percent>=150) return 2
if(percent>=100) return 1.9
if(percent>=75) return 1.8
if(percent>=50) return 1.5
if(percent>=20) return 1.4

return 1.2

}

// ============================
// プレイヤー登録
// ============================

app.post("/host/addPlayer",(req,res)=>{

const {name}=req.body

if(!game.allowedPlayers.includes(name)){

game.allowedPlayers.push(name)

}

res.json(game)

})

// ============================
// 参加
// ============================

app.post("/join",(req,res)=>{

const {name}=req.body

if(!game.allowedPlayers.includes(name)){

return res.send("登録されていない名前")

}

if(!game.players[name]){

game.players[name]=game.settings.startMoney
game.trust[name]=game.settings.startTrust
game.loanUsed[name]=false
game.eliminated[name]=false

}

res.json(game)

})

// ============================
// BET
// ============================

app.post("/bet",(req,res)=>{

const {name,amount}=req.body

if(!game.betEnabled)
return res.send("BET停止中")

if(game.eliminated[name])
return res.send("破産しています")

const currentBet = game.bets[name] || 0

if(amount < currentBet)
return res.send("BETは減らせません")

const debt = game.loans[name]?.amount || 0

const maxBet = game.players[name] + debt

if(amount > maxBet)
return res.send("賭けすぎ")

game.bets[name] = amount

game.betHistory.push({

player:name,
bet:amount,
round:game.round

})

res.json(game)

})

// ============================
// 降りる
// ============================

app.post("/fold",(req,res)=>{

const {name}=req.body

game.folded[name]=true

res.json(game)

})

// ============================
// 借金成功率
// ============================

function trustChance(value){

if(value>=100) return 100
if(value>=80) return 80
if(value>=70) return 70
if(value>=50) return 50
if(value>=30) return 30
if(value>=10) return 10
if(value>=1) return 5

return 0

}

// ============================
// 借金申請
// ============================

app.post("/loan/request",(req,res)=>{

const {name,amount}=req.body

if(game.loanUsed[name])
return res.send("このラウンド借金済み")

if(game.loans[name])
return res.send("借金返済後に借りてください")

if(amount<=0)
return res.send("金額エラー")

let lenders =
Object.keys(game.players)
.filter(p=>p!==name && game.players[p]>=amount)

if(lenders.length===0)
return res.send("貸せる人なし")

const lender =
lenders[Math.floor(Math.random()*lenders.length)]

const chance = trustChance(game.trust[name])

if(Math.random()*100 > chance){

return res.send("借金通知失敗")

}

game.loanRequests[lender]={

borrower:name,
amount:amount

}

if(sockets[lender]){

sockets[lender].emit("loanRequest",{

borrower:name,
amount:amount

})

}

game.loanUsed[name]=true

res.json({lender})

})

// ============================
// 借金承認
// ============================

app.post("/loan/accept",(req,res)=>{

const {name}=req.body

const reqLoan = game.loanRequests[name]

if(!reqLoan)
return res.send("申請なし")

const {borrower,amount} = reqLoan

if(game.players[name] < amount)
return res.send("貸すお金不足")

game.players[name] -= amount
game.players[borrower] += amount

game.loans[borrower] = {
lender:name,
amount:amount,
round:game.round
}

game.trust[name] += 10
game.trust[borrower] -= 5

delete game.loanRequests[name]

res.json(game)

})


// ============================
// 借金拒否
// ============================

app.post("/loan/reject",(req,res)=>{

const {name}=req.body

delete game.loanRequests[name]

res.json(game)

})


// ============================
// 借金返済
// ============================

app.post("/loan/repay",(req,res)=>{

const {name}=req.body

const loan = game.loans[name]

if(!loan)
return res.send("借金なし")

const interest = Math.ceil(loan.amount * 0.1)

const total = loan.amount + interest

if(game.players[name] < total)
return res.send("返済不可")

game.players[name] -= total
game.players[loan.lender] += total

delete game.loans[name]

game.trust[name] += 3

res.json(game)

})


// ============================
// 信用換金
// ============================

app.post("/trust/exchange",(req,res)=>{

const {name}=req.body

if(game.trust[name] < game.settings.trustExchange)
return res.send("信用不足")

const gain =
Math.floor(game.settings.startMoney * game.settings.trustPercent)

game.trust[name] -= game.settings.trustExchange
game.players[name] += gain

res.json(game)

})


// ============================
// 勝者処理
// ============================

app.post("/winner",(req,res)=>{

const {name}=req.body

if(game.folded[name])
return res.send("降りています")

if(!game.bets[name])
return res.send("BETなし")

let pot = 0

for(let p in game.bets){

pot += game.bets[p]

game.players[p] -= game.bets[p]

}

const multiplier =
calcMultiplier(game.bets[name],game.settings.startMoney)

const win = Math.floor(pot * multiplier)

game.players[name] += win

game.turnHistory.push({

round:game.round,
winner:name,
pot:pot,
multiplier:multiplier,
win:win

})

io.emit("turnEnd",{

winner:name,
amount:win

})

game.bets = {}
game.folded = {}
game.loanUsed = {}

game.round ++


// ============================
// 破産チェック
// ============================

for(let p in game.players){

const money = game.players[p]

const trust = game.trust[p]

if(money <= 0)
game.eliminated[p] = true

if(trust <= 0)
game.eliminated[p] = true

if(money < game.settings.minBet)
game.eliminated[p] = true

}


res.json(game)

})


// ============================
// BET受付切替
// ============================

app.post("/host/betToggle",(req,res)=>{

game.betEnabled = !game.betEnabled

res.json(game)

})


// ============================
// ゲーム設定
// ============================

app.post("/host/settings",(req,res)=>{

const s = req.body

game.settings.startMoney = Number(s.startMoney)
game.settings.startTrust = Number(s.startTrust)
game.settings.trustExchange = Number(s.trustExchange)
game.settings.trustPercent = Number(s.trustPercent)
game.settings.minBet = Number(s.minBet)

res.json(game)

})


// ============================
// 他ゲーム用操作
// ============================

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


// ============================
// ゲームリセット
// ============================

app.post("/host/reset",(req,res)=>{

game.players={}
game.bets={}
game.folded={}

game.betHistory=[]
game.turnHistory=[]

game.loans={}
game.loanRequests={}
game.loanUsed={}

game.trust={}
game.eliminated={}

game.online={}

game.round=1

res.json(game)

})


// ============================
// 状態取得
// ============================

app.get("/state",(req,res)=>{

res.json(game)

})


// ============================
// サーバー起動
// ============================

server.listen(PORT,()=>{

console.log("Server running on port",PORT)

})
