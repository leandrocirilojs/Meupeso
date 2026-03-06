let logs = JSON.parse(localStorage.getItem("logs")||"[]")

let xp = Number(localStorage.getItem("xp")||0)

function save(){
localStorage.setItem("logs",JSON.stringify(logs))
}

function addXP(val){

xp+=val

localStorage.setItem("xp",xp)

updateXP()

}

function updateXP(){

const level=Math.floor(xp/200)+1

document.getElementById("userLevel").innerText=level
document.getElementById("userXP").innerText=xp

}

updateXP()

function searchFood(){

const q=document.getElementById("foodSearch").value.toLowerCase()

const res=FOODS.filter(f=>f.name.toLowerCase().includes(q))

const el=document.getElementById("foodResults")

el.innerHTML=res.map(f=>

`<div onclick="addFood('${f.name}')">

${f.name} - ${f.cal} kcal

</div>`

).join("")

}

function addFood(name){

const food=FOODS.find(f=>f.name==name)

logs.push({

name:food.name,

cal:food.cal,

date:new Date().toLocaleDateString()

})

save()

addXP(10)

renderToday()

}

function renderToday(){

const today=new Date().toLocaleDateString()

const items=logs.filter(l=>l.date==today)

let cal=0

items.forEach(i=>cal+=i.cal)

document.getElementById("caloriesToday").innerText=cal

document.getElementById("todayLog").innerHTML=

items.map(i=>`<div>${i.name} ${i.cal} kcal</div>`).join("")

updateForecast(cal)

suggestMeal(cal)

}

function updateForecast(cal){

const tdee=2200

const deficit=tdee-cal

const week=(deficit*7)/7700

document.getElementById("forecast").innerText=

week.toFixed(2)+" kg por semana"

}

function suggestMeal(cal){

let meal=""

if(cal<1200)
meal="🍗 Frango + arroz"

else if(cal<1800)
meal="🥗 Salada + proteína"

else
meal="🍎 Fruta"

document.getElementById("suggestMeal").innerText=meal

}

renderToday()

function startScanner(){

Quagga.init({

inputStream:{
type:"LiveStream",
target:document.querySelector("#scanner")
},

decoder:{
readers:["ean_reader"]
}

},function(err){

if(!err)
Quagga.start()

})

}
