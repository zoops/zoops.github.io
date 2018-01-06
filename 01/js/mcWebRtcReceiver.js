'use strict';

var input_receiver_id = document.querySelector('input#input_receiver_id');

var input_room_id = document.querySelector('input#input_room_id');
var input_offerDesc = document.querySelector('textarea#input_offerDesc');
var output_answerDesc = document.querySelector('textarea#output_answerDesc');


var vid1 = document.getElementById('vid1');
var vid2 = document.getElementById('vid2');

var btn_start = document.getElementById('btn_start');

btn_start.addEventListener('click', test_start);

var mc_rtc_receiver_object = null;
function test_start() {
    g_mc_ws_component.onJoinRoomSuccess = function (data) {
        input_offerDesc.value = data.d1;
        mc_rtc_receiver_object.receiveOffer(data.d4);
    };

    mc_rtc_receiver_object = new McWebRtcReceiver();
    mc_rtc_receiver_object.init();
    mc_rtc_receiver_object.setRemoteVideoElement(vid2);
}

function McWebRtcReceiver() {
}
McWebRtcReceiver.prototype.stop = function () {
    if (this.pc) {
        this.pc.close();
    }
    this.pc = null;
};
McWebRtcReceiver.prototype.setRemoteVideoElement = function (videoElement) {
    this.videoElement = videoElement;
};
McWebRtcReceiver.prototype.init = function () {
    var that = this;
    that.myReference = this;

    that.offerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    };

    var videoTracks = g_rtc_local_stream.getVideoTracks();
    var audioTracks = g_rtc_local_stream.getAudioTracks();
    if (videoTracks.length > 0) {
        trace('Using Video device: ' + videoTracks[0].label);
    }
    if (audioTracks.length > 0) {
        trace('Using Audio device: ' + audioTracks[0].label);
    }

    var servers = null;
    that.pc = new RTCPeerConnection(servers);
    that.pc.onicecandidate = function (e) {
        if (e.candidate) {
        }
        else {
            trace('onCheckIcdCandidateCompleted');
            output_answerDesc.value = that.pc.localDescription.sdp;

            var userId = input_receiver_id.value;
            var sdp = that.pc.localDescription.sdp;
            g_mc_ws_component.answerRoom(userId, sdp);
        }
    };
    that.pc.ontrack = function (e) {
        trace('## Received remote stream try');
        if (that.videoElement.srcObject !== e.streams[0]) {
            that.videoElement.srcObject = e.streams[0];
            trace('## Received remote stream changed');
        }
    };

    g_rtc_local_stream.getTracks().forEach(
        function (track) {
            that.pc.addTrack(
                track,
                g_rtc_local_stream
            );
        }
    );

    var userId = 'testReceiver01';
    //var roomId = input_room_id.value;
    var roomId = '';
    g_mc_ws_component.joinRoom(userId, roomId);
};

McWebRtcReceiver.prototype.receiveOffer = function (sdpString) {
    var descObject = {
        type: 'offer',
        sdp: sdpString
    };
    this.pc.setRemoteDescription(descObject);
    this.createAnswer();
};
McWebRtcReceiver.prototype.createAnswer = function () {
    var that = this.myReference;
    this.pc.createAnswer().then(
        function (desc) {
            // Provisional answer, set a=inactive & set sdp type to pranswer.
            desc.sdp = desc.sdp.replace(/a=recvonly/g, 'a=inactive');
            desc.type = 'pranswer';
            that.pc.setLocalDescription(desc).then(
                function () {
                    trace('localDescription success.');
                },
                function () {
                    trace('Failed to set setLocalDescription: ' + error.toString());
                    that.stop();
                }
            );
        },
        function (error) {
            trace('Failed to set createAnswer: ' + error.toString());
            that.stop();
        }
    );
};

var g_rtc_local_stream;
navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
})
    .then(function (stream) {
        trace('Received local stream');
        vid1.srcObject = stream;
        g_rtc_local_stream = stream;
    })
    .catch(function (e) {
        alert('getUserMedia() error: ' + e);
    });