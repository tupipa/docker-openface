/*
Copyright 2015-2016 Carnegie Mellon University

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ?
        function(c, os, oe) {
            navigator.mediaDevices.getUserMedia(c).then(os,oe);
        } : null ||
    navigator.msGetUserMedia;

window.URL = window.URL ||
    window.webkitURL ||
    window.msURL ||
    window.mozURL;

// http://stackoverflow.com/questions/6524288
$.fn.pressEnter = function(fn) {

    return this.each(function() {
        $(this).bind('enterPress', fn);
        $(this).keyup(function(e){
            if(e.keyCode == 13)
            {
              $(this).trigger("enterPress");
            }
        })
    });
 };

function registerHbarsHelpers() {
    // http://stackoverflow.com/questions/8853396
    Handlebars.registerHelper('ifEq', function(v1, v2, options) {
        if(v1 === v2) {
            return options.fn(this);
        }
        return options.inverse(this);
    });
}

function sendFrameLoop() {
    if (socket == null || socket.readyState != socket.OPEN ||
        !vidReady || numNulls != defaultNumNulls) {
        return;
    }

    if (tok > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = vid.width;
        canvas.height = vid.height;
        var cc = canvas.getContext('2d');
        cc.drawImage(vid, 0, 0, vid.width, vid.height);
        var apx = cc.getImageData(0, 0, vid.width, vid.height);

        var dataURL = canvas.toDataURL('image/jpeg', 0.6)

        var msg = {
            'type': 'FRAME',
            'dataURL': dataURL,
            'identity': defaultPerson
        };
        socket.send(JSON.stringify(msg));
        tok--;
    }
    setTimeout(function() {requestAnimFrame(sendFrameLoop)}, 250);
}


function getPeopleInfoHtml() {
    var info = {'-1': 0};
    var len = people.length;
    for (var i = 0; i < len; i++) {
        info[i] = 0;
    }

    var len = images.length;
    for (var i = 0; i < len; i++) {
        id = images[i].identity;
        info[id] += 1;
    }

    var h = "<li><b>Unknown:</b> "+info['-1']+"</li>";
    var len = people.length;
    for (var i = 0; i < len; i++) {
        h += "<li><b>"+people[i]+":</b> "+info[i]+"</li>";
    }
    return h;
}

function redrawPeople() {
    var context = {people: people, images: images};
    $("#peopleTable").html(peopleTableTmpl(context));

    var context = {people: people};
    $("#defaultPersonDropdown").html(defaultPersonTmpl(context));

    $("#peopleInfo").html(getPeopleInfoHtml());
}

function getDataURLFromRGB(rgb) {
    var rgbLen = rgb.length;

    var canvas = $('<canvas/>').width(96).height(96)[0];
    var ctx = canvas.getContext("2d");
    var imageData = ctx.createImageData(96, 96);
    var data = imageData.data;
    var dLen = data.length;
    var i = 0, t = 0;

    for (; i < dLen; i +=4) {
        data[i] = rgb[t+2];
        data[i+1] = rgb[t+1];
        data[i+2] = rgb[t];
        data[i+3] = 255;
        t += 3;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
}

function updateRTT() {
    var diffs = [];
    for (var i = 5; i < defaultNumNulls; i++) {
        diffs.push(receivedTimes[i] - sentTimes[i]);
    }
    $("#rtt-"+socketName).html(
        jStat.mean(diffs).toFixed(2) + " ms (σ = " +
            jStat.stdev(diffs).toFixed(2) + ")"
    );
}

function sendState() {
    var msg = {
        'type': 'ALL_STATE',
        'images': images,
        'people': people,
        'training': training
    };
    socket.send(JSON.stringify(msg));
}

function searchNewServer(){
    
    var serverIndex = 0
    var totalTry = 0;
    while (serverConnectionError ){
        if (totalTry >= serverlist.length) {
            break 
        }
        totalTry++
        console.log("Now totalTry: " + totalTry)
        serverIndex = (currentServerIndex + totalTry) % serverlist.length

        console.log("server Index: " + serverIndex + ". server: " + serverlist[serverIndex] )

        redrawPeople();
        createSocket("wss://" + serverlist[serverIndex] + ":9000", "New");
    }
    if (serverConnectionError){
        console.log("! ! cannot find any available server.");
    }else{
        currentServerIndex = serverIndex
        console.log("!! find a new server: " + serverlist[currentServerIndex])
        window.location.hostname = serverlist[currentServerIndex]

        clearInterval(searchInterval)
    }
}
function pingPongTimeoutFunction (){

    console.log("connection no ping/pong response...");

    if (!serverConnectionError) {
        serverConnectionError=true
    }

    if (socket_connected ) {
        socket.close()
        socket_connected = false;
    }

    if(pingPongEnabled){
        console.log("now stop ping pong..")
        clearInterval(pingPongInterval)
        pingPongEnabled = false;
    }

    console.log("Start searching interval, trying to connect a new server....");
    serverConnectionError=true
    searchNewServer()
    //searchInterval = setInterval (searchNewServer, 20000)


}
function createSocket(address, name) {
    socket = new WebSocket(address);
    socketName = name;
    socket.binaryType = "arraybuffer";
    function ping(){

        if (serverConnectionError){
            return
        }

        if (socket != null) { 
            socket.send(JSON.stringify({'type': 'CLIENTPING'}));
        }else{
            serverConnectionError = true;
            return
        }

        pingPongTimeout = setTimeout(pingPongTimeoutFunction, pingPongTimeoutTime)
    }

    function clear_ping_timer(){
         if(pingPongTimeout){
            clearTimeout(pingPongTimeout)
         }
    }

    socket.onopen = function() {
        serverConnectionError = false;
        $("#serverStatus").html("Connected to " + name);
        sentTimes = [];
        receivedTimes = [];
        tok = defaultTok;
        numNulls = 0

        ping()
        pingPongInterval = setInterval(ping, pingPongIntervalTime)
        pingPongEnabled = true;

        socket.send(JSON.stringify({'type': 'NULL'}));
        sentTimes.push(new Date());
    }
    socket.onmessage = function(e) {
        console.log(e);
        j = JSON.parse(e.data)
        if (j.type == "NULL") {
            receivedTimes.push(new Date());
            numNulls++;
            if (numNulls == defaultNumNulls) {
                updateRTT();
                sendState();
                sendFrameLoop();
            } else {
                socket.send(JSON.stringify({'type': 'NULL'}));
                sentTimes.push(new Date());
            }
        } else if (j.type == "PROCESSED") {
            tok++;
        } else if (j.type == "NEW_IMAGE") {
            images.push({
                hash: j.hash,
                identity: j.identity,
                image: getDataURLFromRGB(j.content),
                representation: j.representation
            });
            redrawPeople();
        } else if (j.type == "IDENTITIES") {
            var h = "Last updated: " + (new Date()).toTimeString();
            h += "<ul>";
            var len = j.identities.length
            if (len > 0) {
                for (var i = 0; i < len; i++) {
                    var identity = "Unknown";
                    var idIdx = j.identities[i];
                    if (idIdx != -1) {
                        identity = people[idIdx];
                    }
                    h += "<li>" + identity + "</li>";
                }
            } else {
                h += "<li>Nobody detected.</li>";
            }
            h += "</ul>"
            $("#peopleInVideo").html(h);
        } else if (j.type == "ANNOTATED") {
            $("#detectedFaces").html(
                "<img src='" + j['content'] + "' width='430px'></img>"
            )
        } else if (j.type == "TSNE_DATA") {
            BootstrapDialog.show({
                message: "<img src='" + j['content'] + "' width='100%'></img>"
            });
        } else if (j.type == "SERVERPONG"){
            clear_ping_timer()
        } else {
            console.log("Unrecognized message type: " + j.type);
        }
    }
    socket.onerror = function(e) {
        console.log("Error creating WebSocket connection to " + address);
        serverConnectionError=true
        console.log(e);
    }
    socket.onclose = function(e) {
        if (e.target == socket) {
            $("#serverStatus").html("Disconnected.");
        }
    }
}

function umSuccess(stream) {
    webcam_stream = stream;

    if (vid.mozCaptureStream) {
        vid.mozSrcObject = stream;
    } else {
        vid.src = (window.URL && window.URL.createObjectURL(stream)) ||
            stream;
    }
        
    var statusButton=document.getElementById("StatusButton")
    statusButton.innerHTML = msg_webcam + "vid.src: " + vid.src

    vid.play();
    vidReady = true;
    sendFrameLoop();
}

function addPersonCallback(el) {
    defaultPerson = people.length;
    var newPerson = $("#addPersonTxt").val();
    if (newPerson == "") return;
    people.push(newPerson);
    $("#addPersonTxt").val("");

    if (socket != null) {
        var msg = {
            'type': 'ADD_PERSON',
            'val': newPerson
        };
        socket.send(JSON.stringify(msg));
    }
    redrawPeople();
}

function initCameraMode(){

    var statusButton=document.getElementById("StatusButton")
    statusButton.innerHTML = msg_webcam

    if (navigator.getUserMedia) {
        var videoSelector = {video : true};
        navigator.getUserMedia(videoSelector, umSuccess, function() {
            alert("Error fetching video from webcam");
        });
    } else {
        alert("No webcam detected.");
    }
    
    //  $("#serverBtn.btn-group > .btn").click(changeServerCallback);
    //  $("#addPersonBtn").click(addPersonCallback);
    //  $("#addPersonTxt").pressEnter(addPersonCallback);
    //  $("#trainingChk").change(trainingChkCallback);
    //  $("#viewTSNEBtn").click(viewTSNECallback);
    //  $("#localAutoTestButton").click(localAutoTestCallback);
     
    //  if (socket_connected){
    //     socket.close();
    //  }

     redrawPeople();
    //  // createSocket("wss://facerec.cmusatyalab.org:9000", "CMU");
    //  createSocket("wss://" + window.location.hostname + ":9000", "Local");
    //  socket_connected = true;
}



function playSelectedFile (event) {

	// 'use strict'
    console.log(event.target.files);
    var statusButton=document.getElementById("StatusButton")
    statusButton.innerHTML = msg_reading_file

    var file = document.getElementById("theFileInput").files[0]
    var type = file.type
    // var videoNode = document.querySelector('video')
    var canPlay = vid.canPlayType(type)
    if (canPlay === '') canPlay = 'no'

    var isError = canPlay === 'no';

    if (isError) {
        return
    }

    var URL = window.URL;

    vid.src = URL.createObjectURL(file)

    var message = 'Playing video type "' + type + '": ' + canPlay + ". file: " + vid.src
    
    document.getElementById("StatusButton").innerHTML = message

    vid.play();
    vidReady = true;
    sendFrameLoop();
    
    redrawPeople();

}

function initLocalFileMode(){

    var statusButton=document.getElementById("StatusButton");
    statusButton.innerHTML = msg_select_file;
     
    var inputNode = document.getElementById("theFileInput")
    inputNode.addEventListener('change', playSelectedFile, false)

    if(webcam_on){
        var track = webcam_stream.getTracks()[0];
        track.stop();
    }
    
     redrawPeople();

}

function localAutoTestCallback() {

    vidReady = false;

    var buttonTest=document.getElementById("localAutoTestButton");
    if (autoTestEnabled == 1){
        buttonTest.innerHTML = "Auto Test Disabled. Click to Enable";
        autoTestEnabled = 0;
        // location.reload();
        initCameraMode();

    }else{
        buttonTest.innerHTML = "Auto Test Enabled. Click to Disable";
        autoTestEnabled = 1;
        initLocalFileMode();
    }

}

function trainingChkCallback() {
    training = $("#trainingChk").prop('checked');
    if (training) {
        makeTabActive("tab-preview");
    } else {
        makeTabActive("tab-annotated");
    }
    if (socket != null) {
        var msg = {
            'type': 'TRAINING',
            'val': training
        };
        socket.send(JSON.stringify(msg));
    }
}

function viewTSNECallback(el) {
    if (socket != null) {
        var msg = {
            'type': 'REQ_TSNE',
            'people': people
        };
        socket.send(JSON.stringify(msg));
    }
}

function findImageByHash(hash) {
    var imgIdx = 0;
    var len = images.length;
    for (imgIdx = 0; imgIdx < len; imgIdx++) {
        if (images[imgIdx].hash == hash) {
            console.log("  + Image found.");
            return imgIdx;
        }
    }
    return -1;
}

function updateIdentity(hash, idx) {
    var imgIdx = findImageByHash(hash);
    if (imgIdx >= 0) {
        images[imgIdx].identity = idx;
        var msg = {
            'type': 'UPDATE_IDENTITY',
            'hash': hash,
            'idx': idx
        };
        socket.send(JSON.stringify(msg));
    }
}

function removeImage(hash) {
    console.log("Removing " + hash);
    var imgIdx = findImageByHash(hash);
    if (imgIdx >= 0) {
        images.splice(imgIdx, 1);
        redrawPeople();
        var msg = {
            'type': 'REMOVE_IMAGE',
            'hash': hash
        };
        socket.send(JSON.stringify(msg));
    }
}

function changeServerCallback() {
    $(this).addClass("active").siblings().removeClass("active");
    switch ($(this).html()) {
    case "Local":
        socket.close();
        redrawPeople();
        createSocket("wss:" + window.location.hostname + ":9000", "Local");
        break;
    case "CMU":
        socket.close();
        redrawPeople();
        createSocket("wss://facerec.cmusatyalab.org:9000", "CMU");
        break;
    case "AWS East":
        socket.close();
        redrawPeople();
        createSocket("wss://54.159.128.49:9000", "AWS-East");
        break;
    case "AWS West":
        socket.close();
        redrawPeople();
        createSocket("wss://54.188.234.61:9000", "AWS-West");
        break;
    default:
        alert("Unrecognized server: " + $(this.html()));
    }
}
