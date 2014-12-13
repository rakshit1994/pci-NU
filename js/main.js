'use strict';
$('#remoteVideo').hide();
$('#localVideo').hide();

var localuser;
var remoteuser;

var isChannelReady;
var isInitiator = false;
var isStarted = false;

var localVideoStream;
var remoteVideoStream;
var pc;

var dataChannel;

var turnReady;
var pc_config;
//window.turnserversDotComAPI.iceServers(function(data) {
   //pc_config = {
  //'iceServers': data
//};
//console.log(data);
//});
//Ice Servers Added
// var pc_config = {
//   'iceServers': [{
//     'url': 'stun:stun.l.google.com:19302'
//   }]
// };

// pc_constraints is not currently used, but the below would allow us to enforce
// DTLS keying for SRTP rather than SDES ... which is becoming the default soon
// anyway. 
var pc_constraints = {
  'optional': [{
    'DtlsSrtpKeyAgreement': true
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};


// The following var's act as the interface between our HTML/CSS code
// and this JS. These allow us to interact between the UI and our application
// logic
var startButton = document.getElementById("startButton");

startButton.disabled = false;

startButton.onclick = createConnection;

//closeButton.onclick = closeDataChannels;

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var room = location.pathname.substring(1);
var user = location.pathname.substring(2);
var socket = io.connect();

var constraints = {
  audio: true,
  video: true
};

function createConnection() {
  if (user === '') {
    user = document.getElementById("userId").value;
  }

  if (room === '') {
    room = document.getElementById("roomId").value;
  }

  if (user === '' || room === '') {
    alert('Both Username and Room Name are Required.');
    return false;
  }
  $('.navbar-toggle').trigger('click');
  localuser = document.getElementById("userId").value;
  if (room !== '') {
    socket.emit('create or join', room); 
  }
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);

  if (location.hostname != "localhost") {
    requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
  }
}

socket.on('chat', function(message) {
  console.log(message);
  $('#chat').append("<span style='color:red;padding-left: 5px;'>" + message.user + "</span>: " + message.msg + "</br>");
});

$('#msg').keypress(function(e) { // text written


  if (e.keyCode === 13) {
    if (user === '') {
      alert('Join Room First');
      return false;
    }
    if ($('#msg').val() === '')
      return false;
    var msg = $('#msg').val();
    var msgob = {
      'user': localuser,
      'msg': msg
    };
    socket.emit('chat', msgob);
    $('#chat').append("<span style='color:green;padding-left: 5px;'>Me</span>: " + msgob.msg + "</br>");
    $('#msg').val('');
  }
});

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room' + room + " is full.");
});


socket.on('join', function(room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('Room ' + room + ' Successsfully joined.');
  isChannelReady = true;
});



function sendMessage(message) {
  socket.emit('message', message);
}

socket.on('message', function(message) {
  if (message === 'Got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    //handleRemoteHangup();
  }
});

////////////////////////////////////////////////////
// This next section is where we deal with setting
// up the actual components of the communication
// we are interested in using. Starting with the
// video streams
////////////////////////////////////////////////////

function trace(text) {
  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

function handleUserMedia(stream) {

  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream);
  localVideoStream = stream;
  sendMessage('Got user media');
  $('#localimg').hide();
  $('#localVideo').show();
  if (isInitiator) {
    maybeStart();
  }
}

function handleUserMediaError(error) {
  console.log('navigator.getUserMedia error: ', error);
}

function maybeStart() {
  if (!isStarted && typeof localVideoStream != 'undefined' && isChannelReady) {
    createPeerConnection();
    pc.addStream(localVideoStream);
    // Add data channels
    //createDataConnection();
    isStarted = true;
    //   console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function(e) {
  sendMessage('bye');
}



/////////////////////////////////////////////////////////
// Next we setup the data channel between us and the far
// peer. This is bi-directional, so we use the same
// connection to send/recv data. However its modal in that
// one end of the connection needs to kick things off,
// so there is logic that varies based on if the JS
// script is acting as the initator or the far end.
/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    var servers = null;
    pc = new webkitRTCPeerConnection(servers, {
      optional: [{
        RtpDataChannels: true
      }]
    });
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;

  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}



function handleIceCandidate(event) {
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
    $('#remoteimg').hide();
    $('#remoteVideo').show();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteVideoStream = event.stream;
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', e);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  //sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}


function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteVideoStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}




