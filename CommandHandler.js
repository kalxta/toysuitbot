var logger;
var sessionKeeper;
var messageSender;

var pendingCommands = [];
var commandTimeout = 60*3;

init = function(log, sk, ms){
    logger = log;
    sessionKeeper = sk;
    messageSender = ms;
}

setPendingCommand = function(userID, cmd, args){
    command = {};
    command.userID = userID;
    command.cmd = cmd;
    command.args = args;
    command.timestamp = Date.now;
    pendingCommands[userID] = command;
}

hasPendingCommand = function(userID){
    var command = pendingCommands[userID];
    if(command != null){
        if((Date.now - command.timestamp)/1000 < commandTimeout){
            return true;
        }
    }
    return false;
}

getPendingCommand = function(userID){
    var command = pendingCommands[userID];
    return command;
}

handleCommand = function(user, userID, channelID, message, evt){
    var profile = sessionKeeper.getProfileFromUserID(userID);
    var cmd;
    var args;
    if(message.indexOf(" ")>-1){
        cmd = message.substring(0, message.indexOf(" "));
        args = message.substring(message.indexOf(" ")+1);
    }else{
        cmd = message;
        args = "";
    }
    args = args.split(',');
    for(i in args){ args[i] = args[i].trim(); }
    if(args.length==1 && args[0]=="") args = [];
    cmd = cmd.toLowerCase();
    logger.info(cmd);
    logger.info(args);
    var context = {
        user: user, 
        userID: userID, 
        channelID: channelID, 
        message: message, 
        evt: evt
    };
    try{
        if(cmd != '!ping' && cmd !='!register'){
            var userProfile = sessionKeeper.getProfileFromUserID(context.userID);
            if(userProfile == undefined) throw "You must be registered to use commands."
        }
        switch(cmd) {
            case('!ping'): ping(profile, args, context); break;
            case('!register'): register(profile, args, context); break;
            case('!toysuit'): toysuit(profile, args, context); break;
            case('!release'): release(profile, args, context); break;
            case('!info'): info(profile, args, context); break;
            case('!set_info'): setInfo(profile, args, context); break;
            case('!kinks'): kinks(profile, args, context); break;
            case('!set_kinks'): setKinks(profile, args, context); break;
            case('!set_nickname'): setNickname(profile, args, context); break;
            case('!set_timer'): setTimer(profile, args, context); break;
            case('!timer'): timer(profile, args, context); break;
            case('!set_toy_type'): setToyType(profile, args, context); break;
            case('!toy_type'): toyType(profile, args, context); break;
            case('!set_timer_bonus'): setTimerBonus(profile, args, context); break;
            case('!trigger_bonus'): triggerBonus(profile, args, context); break;
            case('!control'): control(profile, args, context); break;
            case('!gag'): gag(profile, args, context); break;
            case('!say'): say(profile, args, context); break;
            case('!voice'): voice(profile, args, context); break;
        }
    }catch(e){
        if((e+"").indexOf("[silent]") == -1){
            messageSender.sendMessage(context.channelID, 'Error: "'+e+'".');
        }
        logger.info("!!!"+e);
        logger.info(e.stack);
    }
}

ping = function(profile, args, context){
    messageSender.sendMessage(context.channelID, 'Pong! ('+args+')');
}

register = function(profile, args, context){
    var profile = sessionKeeper.getProfileFromUserID(context.userID);
    if(profile == undefined){
        var str = 2;
        var res = 2;
        var wil = 2;
        if(args.length == 0){

        }else if(args.length == 3){
            if(isNaN(args[0]) || isNaN(args[1]) || isNaN(args[2])) throw "Bad command arguments";
            str = limit(args[0], 1, 3);
            res = limit(args[1], 1, 3);
            wil = limit(args[2], 1, 3);
        }else{
            throw "Wrong number of arguments"
        }
        profile = sessionKeeper.createProfile(context.userID, context.user, str, res, wil);
        sessionKeeper.updateProfile(profile);
        messageSender.sendMessage(context.channelID, 'You have successfully registered.');
    }else{
        messageSender.sendMessage(context.channelID, 'You are already registered.');
    }
}

requirePM = function(context){
    return true;
    logger.info(context);
    for(var key in context.evt.d){
        logger.info("  "+key);
    }
    logger.info("type: "+context.evt.d.type);
    logger.info("requirePM() -> "+context.channelID+" == "+context.userID);
    if(context.channelID != context.userID){
        messageSender.sendMessage(context.channelID, "Sorry, that command is only available via PM. Please try again via pm! :)");
        throw "[silent] Command requires PM";
    }
}

noOmegas = function(profile){
    if(profile['mode'] == "suited" && profile['toy mode'] == "omega") throw "Omega toys can't do that";
}

toysuit = function(profile, args, context){
    var toyProfile = sessionKeeper.getProfileFromUserName(args[0], context.channelID);
    var userProfile = sessionKeeper.getProfileFromUserID(context.userID);
    noOmegas(userProfile);
    if(toyProfile == undefined) throw "Target is not registered"
    if(toyProfile['ownerID'] == undefined){
        toyProfile['ownerID'] = userProfile['userID'];
        toyProfile['mode'] = "suited";
        toyProfile['toy mode'] = getNextLowestToyType(getToyType(userProfile));
        toyProfile['suit timer bonus amount'] = undefined;
        toyProfile['suit timer bonus count'] = 0;
        toyProfile['suit timer'] = 0;
        toyProfile['suit timestamp'] = 0;
        toyProfile['controlled'] = false;
        toyProfile['gagged'] = false;
        sessionKeeper.updateProfile(toyProfile);
        messageSender.sendMessage(context.channelID, getName(toyProfile)+' has been toysuited by '+getName(userProfile)+'.');
    }else{
        throw "Target is already toysuited"
    }
}

release = function(profile, args, context){
    var toyProfile = sessionKeeper.getProfileFromUserName(args[0], context.channelID);
    var userProfile = sessionKeeper.getProfileFromUserID(context.userID);
    if(toyProfile == undefined) throw "Target is not registered"
    if(toyProfile['mode'] == "unsuited"){
        toyProfile['mode'] = "unsuited";
        toyProfile['ownerID'] = undefined;
        sessionKeeper.updateProfile(toyProfile);
        throw "Target is not toysuited";
    }else if(toyProfile['userID'] == userProfile['userID']){
        //Toy attempting to release themselves.
        if(sessionKeeper.getRemainingTimerSeconds(toyProfile)>0){
            //Timer's not up.
            var time = readableTime(sessionKeeper.getRemainingTimerSeconds(toyProfile));
            messageSender.sendAction(context.channelID, getName(toyProfile)+" attempts to release itself, but it's timer still reads '"+time+"'.");
        }else{
            //Timer's up. Check suit settings.
            //Whatever. Just do it for now.
            toyProfile['mode'] = "unsuited";
            toyProfile['ownerID'] = undefined;
            sessionKeeper.updateProfile(toyProfile);
            messageSender.sendMessage(context.channelID, getName(userProfile)+' released '+getName(toyProfile)+'.');
        }
    }else if(toyProfile['owner'] == undefined){
        //No owner. Check suit settings.
        //Whatever. Just do it for now.
        toyProfile['mode'] = "unsuited";
        toyProfile['ownerID'] = undefined;
        sessionKeeper.updateProfile(toyProfile);
        messageSender.sendMessage(context.channelID, getName(userProfile)+' released '+getName(toyProfile)+'.');
    }else if(toyProfile['ownerID'] != userProfile['userID']){
        //User isn't the toy's owner.
        throw "You are not the toy's owner";
    }else{
        toyProfile['mode'] = "unsuited";
        toyProfile['ownerID'] = undefined;
        sessionKeeper.updateProfile(toyProfile);
        messageSender.sendMessage(context.channelID, getName(userProfile)+' released '+getName(toyProfile)+'.');
    }
}

info = function(profile, args, context){
    requirePM(context);
    if(args.length > 1) throw "Wrong number of arguments";
    var userProfile;
    if(args.length == 0){
        userProfile = sessionKeeper.getProfileFromUserID(context.userID);
    }else if(args.length == 1){
        userProfile = sessionKeeper.getProfileFromUserName(args[0]);
    }
    if(userProfile == undefined) throw "That user isn't registered"

    var info = "";
    if(userProfile['mode'] == "suited"){
        info += getName(userProfile)+" is a toy. ";
        if(userProfile['ownerID'] == undefined) info += "They have no owner.";
        else info += "They are owned by " + getOwner(userProfile)['name'];
    }
    info += "\nInfo: "+userProfile['info'];
    messageSender.sendMessage(context.channelID, info);
}

setInfo = function(profile, args, context){
    requirePM(context);
    if(args.length == 0 || args.length > 2) throw "Wrong number of arguments";
    var targetProfile;
    var info;
    if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        info = args[0];
    }else if(args.length == 2){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
        info = args[1];
    }
    targetProfile['info'] = info;
    sessionKeeper.updateProfile(targetProfile);
}

kinks = function(profile, args, context){
    requirePM(context);
    if(args.length > 1) throw "Wrong number of arguments";
    var userProfile;
    if(args.length == 0){
        userProfile = sessionKeeper.getProfileFromUserID(context.userID);
    }else if(args.length == 1){
        userProfile = sessionKeeper.getProfileFromUserName(args[0]);
    }
    if(userProfile == undefined) throw "That user isn't registered"

    var kinks = userProfile['kinks'];
    messageSender.sendMessage(context.userID, userProfile['name']+"'s kinks: \n"+kinks);
}

setKinks = function(profile, args, context){
    requirePM(context);
    if(args.length == 0 || args.length > 2) throw "Wrong number of arguments";
    var targetProfile;
    var kinks;
    if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        kinks = args[0];
    }else if(args.length == 2){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
        kinks = args[1];
    }
    targetProfile['kinks'] = kinks;
    sessionKeeper.updateProfile(targetProfile);
}

setNickname = function(profile, args, context){
    var userProfile = sessionKeeper.getProfileFromUserID(context.userID);
    noOmegas(targetProfile);
    requirePM(context);
    if(args.length == 0 || args.length > 2) throw "Wrong number of arguments";
    var targetProfile;
    var nickname;
    if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        nickname = args[0];
    }else if(args.length == 2){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
        nickname = args[1];
        if(nickname == "[reset]") nickname = undefined;
    }
    targetProfile['nickname'] = nickname;
    sessionKeeper.updateProfile(targetProfile);
}

setTimer = function(profile, args, context){
    requirePM(context);
    if(args.length == 0 || args.length > 2) throw "Wrong number of arguments";
    var targetProfile;
    var time;
    if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        time = args[0];
    }else if(args.length == 2){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
        time = args[1];
    }
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"
    if(sessionKeeper.getRemainingTimerSeconds(targetProfile) > 0) throw "Cannot edit existing suit timer"

    time = time.split(':');
    var timeAmt = 0;
    for(var i=0; i<time.length; i++){
        var j = time.length-i-1;
        switch(j){
            case(0): timeAmt += time[i]*1; break;
            case(1): timeAmt += time[i]*60; break;
            //case(2): timeAmt += time[i]*60*60; break;
        }
    }
    timeAmt = Math.min(60*5, timeAmt);

    targetProfile['suit timer'] = timeAmt;
    targetProfile['suit timestamp'] = Math.floor(Date.now() / 1000);
    targetProfile['suit timer bonus'] = 0;
    sessionKeeper.updateProfile(targetProfile);
}

timer = function(profile, args, context){
    requirePM(context);
    if(args.length > 1) throw "Wrong number of arguments";
    var targetProfile;
    var time;
    if(args.length == 0){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        if(targetProfile['mode'] == "unsuited") throw "Target not toysuited"
    }else if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['mode'] == "unsuited") throw "Target not toysuited"
    }
    time = sessionKeeper.getRemainingTimerSeconds(targetProfile);

    if(time < 0){
        time = 0;
    }

    messageSender.sendAction(context.channelID, getName(targetProfile)+"'s timer reads: \n"+readableTime(time));
}

setToyType = function(profile, args, context){
    requirePM(context);
    if(args.length != 2) throw "Wrong number of arguments";
    var targetProfile;
    var userProfile
    var type;
    if(args.length == 2){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        userProfile = sessionKeeper.getProfileFromUserID(context.userID);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
        if(userProfile['mode'] == "suited" && userProfile['toy mode'] == undefined) throw "Toys without a set type cannot set other toys' types"
        type = args[1];
    }
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"
    if(targetProfile['toy mode'] != undefined && sessionKeeper.getRemainingTimerSeconds(targetProfile) > 0) throw "Cannot change toy type once timer is set"

    type = type.toLowerCase();
    switch(type){
        case("alpha"):
            if(userProfile['mode'] == "suited") throw "Toys cannot create alpha toys"
            targetProfile['toy mode'] = "alpha";
            break;
        case("beta"):
            if(userProfile['mode'] == "suited" && userProfile['toy mode'] != "alpha") throw "Non-alpha toys cannot create beta toys"
            targetProfile['toy mode'] = "beta"; break;
            break;
        case("omega"):
            if(userProfile['mode'] == "suited" && userProfile['toy mode'] == "omega") throw "Omega toys cannot create toys"
            targetProfile['toy mode'] = "omega"; break;
            break;
    }
    sessionKeeper.updateProfile(targetProfile);
}

toyType = function(profile, args, context){
    requirePM(context);
    if(args.length > 1) throw "Wrong number of arguments";
    var targetProfile;
    var time;
    if(args.length == 0){
        targetProfile = sessionKeeper.getProfileFromUserID(context.userID);
        if(targetProfile['mode'] == "unsuited") throw "Target not toysuited"
    }else if(args.length == 1){
        targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
        if(targetProfile == undefined) throw "Target not registered";
        if(targetProfile['mode'] == "unsuited") throw "Target not toysuited"
    }
    type = targetProfile['toy mode'];
    if(type == undefined) throw "Toy type not set"

    var typeText = "";
    switch(type){
        case("alpha"): typeText = "an α"; break;
        case("beta"): typeText = "a β"; break;
        case("omega"): typeText = "an ω"; break;
    }

    messageSender.sendAction(context.channelID, getName(targetProfile)+" is "+typeText+" toy.");
}

setTimerBonus = function(profile, args, context){
    requirePM(context);
    if(args.length != 2) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"
    if(targetProfile['suit timer bonus amount'] != undefined) throw "Suit timer bonus already set"

    var time = args[1];
    time = time.split(':');
    var timeAmt = 0;
    for(var i=0; i<time.length; i++){
        var j = time.length-i-1;
        switch(j){
            case(0): timeAmt += time[i]*1; break;
            case(1): timeAmt += time[i]*60; break;
            //case(2): timeAmt += time[i]*60*60; break;
        }
    }
    timeAmt = Math.min(60*5, timeAmt);
    targetProfile['suit timer bonus amount'] = timeAmt;
    sessionKeeper.updateProfile(targetProfile);
    messageSender.sendAction(context.channelID, getName(targetProfile)+"'s timer bonus was set to "+readableTime(timeAmt));
}

triggerBonus = function(profile, args, context){
    requirePM(context);
    if(args.length != 1) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"

    var bonusAmount = targetProfile['suit timer bonus amount'];
    targetProfile['suit timer bonus count']++;
    targetProfile['suit timer'] += targetProfile['suit timer bonus amount'];
    sessionKeeper.updateProfile(targetProfile);
    messageSender.sendAction(context.channelID, getName(targetProfile)+"'s timer bonus was triggered, adding "+readableTime(bonusAmount)+" to their timer.");
}

control = function(profile, args, context){
    requirePM(context);
    if(args.length != 1) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"

    if(targetProfile['controlled']) targetProfile['controlled'] = false;
    else targetProfile['controlled'] = true;

    sessionKeeper.updateProfile(targetProfile);
    if(targetProfile['controlled']){
        messageSender.sendAction(context.channelID, getName(targetProfile)+"'s suit has taken full control of their body.");
        messageSender.sendAction(targetProfile['userID'], 'You feel the suit take full control of your body.');
    }else{
        messageSender.sendAction(context.channelID, getName(targetProfile)+"'s suit has relaxed control of their body.");
        messageSender.sendAction(targetProfile['userID'], 'You feel the suit relax control of your body.');
    }
}

gag = function(profile, args, context){
    requirePM(context);
    if(args.length != 1) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"

    if(targetProfile['gagged']) targetProfile['gagged'] = false;
    else targetProfile['gagged'] = true;

    sessionKeeper.updateProfile(targetProfile);
    if(targetProfile['gagged']){
        messageSender.sendAction(context.channelID, getName(targetProfile)+"'s gag swells, leaving their mouth usable only as a hole to fuck.");
    }else{
        messageSender.sendAction(context.channelID, getName(targetProfile)+"'s gag deflates, allowing them to talk again.");
    }
}

say = function(profile, args, context){
    requirePM(context);
    if(args.length != 2) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    var message = args[1];
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"
    
    messageSender.sendMessage(targetProfile['lastChannelID'], "**" + getName(targetProfile) + "**: " + "*"+message+"*");
}

voice = function(profile, args, context){
    requirePM(context);
    if(args.length != 2) throw "Wrong number of arguments";
    var targetProfile = sessionKeeper.getProfileFromUserName(args[0]);
    var message = args[1];
    if(targetProfile == undefined) throw "Target not registered";
    if(targetProfile['ownerID'] != context.userID) throw "You do not own them"
    if(targetProfile['mode'] == "unsuited") throw "Target not wearing a toysuit"
    
    messageSender.sendMessage(targetProfile['userID'], "**Toysuit**: " + "*"+message+"*");
}

readableTime = function(time){
    var timeText = "";
    var minutes = 0;
    var seconds = 0;
    if(time >= 60){
        minutes = Math.floor(time/60);
        time -= 60*minutes;
    }
    seconds = Math.floor(time);

    if(minutes < 10) timeText += "0";
    timeText += minutes+":";
    if(seconds < 10) timeText += "0";
    timeText += seconds;

    return timeText;
}

limit = function(val, min, max){
    return Math.min(max, Math.max(min, val));
}

module.exports = {
    init: init,
    handleCommand: handleCommand
}