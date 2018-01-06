'use strict';


var input_room_title = document.querySelector('input#input_room_title');
var input_sender_id = document.querySelector('input#input_sender_id');

var output_offerDesc = document.querySelector('textarea#output_offerDesc');
var input_answerDesc = document.querySelector('textarea#input_answerDesc');
var input_room_link = document.querySelector('input#input_room_link');


var vid1 = document.getElementById('vid1');
var vid2 = document.getElementById('vid2');

var btn_start = document.getElementById('btn_start');

btn_start.addEventListener('click', test_start);


var mc_rtc_sender_object = null;
function test_start() {
    g_mc_ws_component.onCreateRoomSuccess = function (data) {
        //input_room_link.value = data.d1 + data.d2;
        var joinUrl = g_mc_ws_component.joinUrl;
        if (joinUrl.endsWith('/') === false)
            joinUrl = joinUrl + '/';
        joinUrl = joinUrl + data.d2;
        input_room_link.value = joinUrl;
    };
    g_mc_ws_component.onAnswerRoomSuccess = function (data) {
        input_answerDesc.value = data.d2;
        mc_rtc_sender_object.receiveAnswer(data.d2);
    };

    mc_rtc_sender_object = new McWebRtcSender();
    mc_rtc_sender_object.setTitle(input_room_title.value);
    mc_rtc_sender_object.setUserId(input_sender_id.value);
    mc_rtc_sender_object.setRemoteVideoElement(vid2);
    mc_rtc_sender_object.init();
}

function McWebRtcSender() {
}
McWebRtcSender.prototype.stop = function () {
    if (this.pc) {
        this.pc.close();
    }
    this.pc = null;
};
McWebRtcSender.prototype.setTitle = function (title) {
    this.roomTitle = title;
};
McWebRtcSender.prototype.setUserId = function (userId) {
    this.userId = userId;
};
McWebRtcSender.prototype.setRemoteVideoElement = function (videoElement) {
    this.videoElement = videoElement;
};
McWebRtcSender.prototype.init = function () {
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
            output_offerDesc.value = that.pc.localDescription.sdp;

            var title = that.roomTitle;
            var userId = that.userId;
            var sdp = that.pc.localDescription.sdp;
            g_mc_ws_component.createRoom(title, userId, sdp);
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

    that.pc.createOffer(
        that.offerOptions
    ).then(
        function (desc) {
            that.pc.setLocalDescription(desc).then(
                function () {
                    trace('localDescription success.');
                },
                function (error) {
                    trace('Failed to set setLocalDescription: ' + error.toString());
                    that.stop();
                }
            );
        },
        function (error) {
            trace('Failed to create session description: ' + error.toString());
            stop();
        }
    );
};

McWebRtcSender.prototype.receiveAnswer = function (sdpString) {
    trace('receiveAnswer');
    var descObject = {
        type: 'pranswer',
        sdp: sdpString
    };
    this.pc.setRemoteDescription(descObject);
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