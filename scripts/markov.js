 var fs = require("fs");
var markov = require('markov');

var chain = null;
var saveScheduled = false;
var json;
var logedin = false;
var dataUpdated = false;
var userList = [];
var userData = {};
var channelList = [];

if (!String.prototype.contains) {
  String.prototype.contains= function() {
    return String.prototype.indexOf.apply(this, arguments) !== -1;
  };
}



var loginData = {
    username: process.env.ROCKETCHAT_USER,
    password: process.env.ROCKETCHAT_PASSWORD
  };

var apiUrl = process.env.ROCKETCHAT_URL+"/api/v1/";

if (fs.existsSync("data.json")) {
	json = JSON.parse(fs.readFileSync("data.json"));
}else{
	json = {};
	json["userdata"] = [];
}

function save(){
	saveScheduled = false;
	fs.writeFileSync("data.json", JSON.stringify(json));
}

function login(robot){
  if(!logedin){
    robot.http(apiUrl+"login")
        .header('Content-Type', 'application/json')
        .post(JSON.stringify(loginData)) (function(err, res, body){
          userData["X-User-Id"] = JSON.parse(body).data.userId;
          userData["X-Auth-Token"] = JSON.parse(body).data.authToken;
          logedin = true;
          refreshChannelList(robot);
        });
  }else{
    refreshChannelList(robot);
  }
}

function refreshChannelList(robot){
  channelList = [];
  userList = [];
  robot.http(apiUrl+"channels.list.joined")
    .header('Content-Type', 'application/json')
    .header("X-User-Id",userData["X-User-Id"])
    .header("X-Auth-Token", userData["X-Auth-Token"])
    .get() (function(err, res, body){
      jsonList = JSON.parse(body);
      for(var i=0;i<jsonList.channels.length;i++){
        channelList.push({id:jsonList.channels[i]._id,name:jsonList.channels[i].name,msgs:jsonList.channels[i].msgs});
      }
        robot.http(apiUrl+"users.list")
        .header('Content-Type', 'application/json')
        .header("X-User-Id",userData["X-User-Id"])
        .header("X-Auth-Token", userData["X-Auth-Token"])
        .get() (function(err, res, body){
          jsonList = JSON.parse(body);
          for(var i=0;i<jsonList.users.length;i++){
            userList.push({id:jsonList.users[i]._id,name:jsonList.users[i].username});
          }
          dataUpdated = true;
      });
    });
}

function getUser(uid){
  for(var i=0;i<userList.length;i++){
    if(userList[i].id.toLowerCase()==uid.toLowerCase()||userList[i].name.toLowerCase()==uid.toLowerCase()){
      return userList[i];
    }
  }
  if(uid.toLowerCase()=="all"){
    return {id:"all",name:"all"};
  }
  return false;
}


function getChannel(uid){
  for(var i=0;i<channelList.length;i++){
    if(channelList[i].id.toLowerCase()==uid.toLowerCase()||channelList[i].name.toLowerCase()==uid.toLowerCase()){
      return channelList[i];
    }
  }
  if(uid.toLowerCase()=="all"){
    return {id:"all",name:"all"};
  }
  return false;
}

function createChain(res){
  if(dataUpdated){
	    var user = {id:"all",name:"all"};
	    var channel = {id:"all",name:"all"};
	    var data = "";
      var args = RegExp(/^(?:ParkerBot.)?\?chain(.*)/).exec(res.message.text)[1].trim().split(" ");
      if(args.length>0){
        user = getUser(args[0]);
        if(user==false){
          res.send("User not found");
          return;
        }
      if(args.length>1){
          channel = getChannel(args[1]);
          if(channel==false){
            res.send("Channel not found");
            return;
          }
        }
      }
      first = true;
      for(var i=0;i<json["userdata"].length;i++){
        if((user.id=="all"||user.id==json["userdata"][i].user)&&(channel.id=="all"||channel.id==json["userdata"][i].room)){
          data += ((first)?"":"\n")+json["userdata"][i].text;
          first = false;
        }
      }
      if(data.split("\n").length==1){
        res.send("Not enough data has bee collected.");
        return;
      }
      res.send("Creating chain with " + (data.split("\n").length) + " items.")
      chain = markov(1);
      chain.seed(data,function(){res.send("Chain is ready.")});
  }else{
    setTimeout(createChain, 600, res);
  }
}

function readHistoryFromChannel(i, robot, rid){
  robot.http(apiUrl+"channels.history?roomId="+channelList[i].id+"&count="+channelList[i].msgs)
    .header('Content-Type', 'application/json')
    .header("X-User-Id",userData["X-User-Id"])
    .header("X-Auth-Token", userData["X-Auth-Token"])
    .get() (function(err, res, body){
      var messages = JSON.parse(body).messages;
      for(var j=0;j<messages.length;j++){
        if(messages[j].msg!=""&&!messages[j].msg.contains("`")&&!messages[j].msg.contains("http")&&messages[j].msg[0]!="?"&&messages[j].msg[0]!="="&&messages[j].msg[0]!="-"&&messages[j].u._id!="nZYJtAGT3cPpzDJsm"&&messages[j].u._id!="uFWF8vRkjcFXeck4N"&&messages[j].u._id!="GGWvxZBoZmXTSzat8"&&messages[j].u._id!="79uC5nC8vB4z5owZv"&&messages[j].u._id!="TKbZYkEDYNwEEXBEz"&&messages[j].u._id!="rocket.cat"&&messages[j].u._id!="RwaoQBpEoRxotyi8e"){
          json["userdata"].push({user:messages[j].u._id, room:messages[j].rid,text:messages[j].msg});

        }
      }
      i++;
      if(i<channelList.length){
        readHistoryFromChannel(i, robot, rid)
      }else{
        save();
        robot.messageRoom(rid, json["userdata"].length + " messages loaded from the history of the channels that the bot is in.");
      }
    });
}
function readHistory(robot, rid){
  if(dataUpdated){
  	json["userdata"] = [];
    readHistoryFromChannel(0, robot, rid)
  }else{
    setTimeout(readHistory, 600, robot, rid);
  }
}


module.exports = function (robot){
  robot.hear(/(.*)/i, function(res) {
    if(RegExp(/^(?:ParkerBot.)?\?help/).exec(res.message.text)){
      res.send("```ParkerBot Help!\n    ?help                                displays this message!\n    ?chain [username|all] [channel|all]  loads a chain\n    ?[message|number]                    replys to message or gives N number random messages```");
    }else if(CommandDataReg = RegExp(/^(?:ParkerBot.)?\?chain(.*)/).exec(res.message.text)){
      dataUpdated = false;
      login(robot);
      createChain(res)
    }else if(CommandDataReg = RegExp(/^(?:ParkerBot.)?\?reset/).exec(res.message.text)&&res.message.user.id=="6it9h5MgB26bMF5Dc"){
      dataUpdated = false;
      login(robot);
      res.send("Resetting.");
  	  readHistory(robot, res.message.user.roomID);
    }else if(CommandDataReg = RegExp(/^(?:ParkerBot.)?\?(.*)/).exec(res.message.text)){
      if(chain==null){
        res.send("You must first use ?chain to create the chain.");
      }else{
        if(CommandDataReg[1].trim().split(" ").length==1&&!isNaN(CommandDataReg[1])){
          var messages = parseInt(CommandDataReg[1].trim());
          for(var i=0;i<messages;i++){
            res.send(chain.fill(chain.pick(), 15).join(' '));
          }
        }else{
          res.send(chain.respond(CommandDataReg[1], 15).join(' '));
        }
      }
    }else if(res.message.user.roomType!="d"&&!res.message.text.contains("`")&&!res.message.text.contains("http")&&res.message.text[0]!="?"&&res.message.text[0]!="="&&res.message.text[0]!="-"&&res.message.user.id!="nZYJtAGT3cPpzDJsm"&&res.message.user.id!="uFWF8vRkjcFXeck4N"&&res.message.user.id!="GGWvxZBoZmXTSzat8"&&res.message.user.id!="79uC5nC8vB4z5owZv"&&res.message.user.id!="TKbZYkEDYNwEEXBEz"&&res.message.user.id!="rocket.cat"&&res.message.user.id!="RwaoQBpEoRxotyi8e"){
		  json["userdata"].push({user:res.message.user.id, room:res.message.user.roomID, text:res.message.text});
		  if(!saveScheduled){
			  setTimeout(save, 60000);
			  saveScheduled = true;
		  }
	  }
  });
};
