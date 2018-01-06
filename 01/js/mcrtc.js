var mc_rtc_ui_manager = {
    showLogin: function (isEnable) {
        if (isEnable == true) {
            $('#div_login_root').show();
        }
        else {
            $('#div_login_root').hide();
        }
    },
    onClickLogin: function(){

    }
}

var mc_rtc_component = {
    isShowLog: true,

    server: null,
    janusObject: null,
    isStarted: false,
    sfutest: null,
    opaqueId: null,

    myRoomId: null,
    myUserName: null,
    myId: null,
    myStream: null,

    myPvtId: null,

    feeds: [],
    bitrateTimer: [],

    doSimulcast: null,

    init: function (debugFlag) {
        if (window.location.protocol === 'http:')
            this.server = "http://" + window.location.hostname + ":8088/janus";
        else
            this.server = "https://" + window.location.hostname + ":8089/janus";
        this.opaqueId = "videoroomtest-" + Janus.randomString(12);

        this.myRoomId = 12345;

        this.doSimulcast = (getQueryStringValue("simulcast") === "yes" || getQueryStringValue("simulcast") === "true");

        if (debugFlag == null || debugFlag == undefined)
            debugFlag = 'error';
        Janus.init({
            debug: debugFlag, callback: function () {
                mc_rtc_component.start();
            }
        });
    },
    printLog: function (type, message) {
        if (mc_rtc_component.isShowLog == true) {
            switch (type) {
                case 'debug':
                    Janus.debug(message);
                    break;
                case 'log':
                    Janus.log(message);
                    break;
                case 'warn':
                    Janus.warn(message);
                    break;
                case 'error':
                    Janus.error(message);
                    break;
                default :
                    Janus.log(message);
                    break;
            }
        }
    },
    showAlert: function (msg) {
        console.log(msg);
        alert(msg);
    },
    start: function () {
        if (this.isStarted === true)
            return;
        this.isStarted = true;
        if (!Janus.isWebrtcSupported()) {
            this.showAlert("No WebRTC support");
            return;
        }
        // Create session
        this.janusObject = new Janus({
            server: this.server,
            success: function () {
                mc_rtc_component.janusObject.attach({
                    plugin: "janus.plugin.videoroom",
                    opaqueId: mc_rtc_component.opaqueId,
                    success: function (pluginHandle) {
                        $('#details').remove();
                        mc_rtc_component.sfutest = pluginHandle;

                        mc_rtc_component.printLog('log', "Plugin attached! (" + mc_rtc_component.sfutest.getPlugin() + ", id=" + mc_rtc_component.sfutest.getId() + ")");
                        mc_rtc_component.printLog('log', "  -- This is a publisher/manager");

                        // Prepare the username registration
                        $('#videojoin').removeClass('hide').show();
                        $('#registernow').removeClass('hide').show();
                        $('#register').click(registerUsername);
                        $('#username').focus();
                        $('#start').removeAttr('disabled').html("Stop")
                            .click(function () {
                                $(this).attr('disabled', true);
                                mc_rtc_component.janusObject.destroy();
                            });
                    },
                    error: function (error) {
                        mc_rtc_component.showAlert("  -- Error attaching plugin...", error);
                    },
                    consentDialog: function (on) {
                        Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
                        if (on) {
                            // Darken screen and show hint
                            $.blockUI({
                                message: '<div><img src="../up_arrow.png"/></div>',
                                css: {
                                    border: 'none',
                                    padding: '15px',
                                    backgroundColor: 'transparent',
                                    color: '#aaa',
                                    top: '10px',
                                    left: (navigator.mozGetUserMedia ? '-100px' : '300px')
                                }
                            });
                        } else {
                            $.unblockUI();
                        }
                    },
                    mediaState: function (medium, on) {
                        Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                    },
                    webrtcState: function (on) {
                        Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                        $("#videolocal").parent().parent().unblock();
                        // This controls allows us to override the global room bitrate cap
                        $('#bitrate').parent().parent().removeClass('hide').show();
                        $('#bitrate a').click(function () {
                            var id = $(this).attr("id");
                            var bitrate = parseInt(id) * 1000;
                            if (bitrate === 0) {
                                Janus.log("Not limiting bandwidth via REMB");
                            } else {
                                Janus.log("Capping bandwidth to " + bitrate + " via REMB");
                            }
                            $('#bitrateset').html($(this).html() + '<span class="caret"></span>').parent().removeClass('open');
                            mc_rtc_component.sfutest.send({"message": {"request": "configure", "bitrate": bitrate}});
                            return false;
                        });
                    },
                    onmessage: function (msg, jsep) {
                        Janus.debug(" ::: Got a message (publisher) :::");
                        Janus.debug(JSON.stringify(msg));
                        var event = msg["videoroom"];
                        Janus.debug("Event: " + event);
                        if (event != undefined && event != null) {
                            if (event === "joined") {
                                // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                mc_rtc_component.myId = msg["id"];
                                mc_rtc_component.myPvtId = msg["private_id"];
                                Janus.log("Successfully joined room " + msg["room"] + " with ID " + mc_rtc_component.myId);
                                publishOwnFeed(true);
                                // Any new feed to attach to?
                                if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                    var list = msg["publishers"];
                                    Janus.debug("Got a list of available publishers/feeds:");
                                    Janus.debug(list);
                                    for (var f in list) {
                                        var id = list[f]["id"];
                                        var display = list[f]["display"];
                                        Janus.debug("  >> [" + id + "] " + display);
                                        newRemoteFeed(id, display)
                                    }
                                }
                            } else if (event === "destroyed") {
                                // The room has been destroyed
                                Janus.warn("The room has been destroyed!");
                                bootbox.alert("The room has been destroyed", function () {
                                    window.location.reload();
                                });
                            } else if (event === "event") {
                                // Any new feed to attach to?
                                if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                    var list = msg["publishers"];
                                    Janus.debug("Got a list of available publishers/feeds:");
                                    Janus.debug(list);
                                    for (var f in list) {
                                        var id = list[f]["id"];
                                        var display = list[f]["display"];
                                        Janus.debug("  >> [" + id + "] " + display);
                                        newRemoteFeed(id, display)
                                    }
                                } else if (msg["leaving"] !== undefined && msg["leaving"] !== null) {
                                    // One of the publishers has gone away?
                                    var leaving = msg["leaving"];
                                    Janus.log("Publisher left: " + leaving);
                                    var remoteFeed = null;
                                    for (var i = 1; i < 6; i++) {
                                        if (mc_rtc_component.feeds[i] != null && mc_rtc_component.feeds[i] != undefined && mc_rtc_component.feeds[i].rfid == leaving) {
                                            remoteFeed = mc_rtc_component.feeds[i];
                                            break;
                                        }
                                    }
                                    if (remoteFeed != null) {
                                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                        $('#remote' + remoteFeed.rfindex).empty().hide();
                                        $('#videoremote' + remoteFeed.rfindex).empty();
                                        mc_rtc_component.feeds[remoteFeed.rfindex] = null;
                                        remoteFeed.detach();
                                    }
                                } else if (msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                                    // One of the publishers has unpublished?
                                    var unpublished = msg["unpublished"];
                                    Janus.log("Publisher left: " + unpublished);
                                    if (unpublished === 'ok') {
                                        // That's us
                                        mc_rtc_component.sfutest.hangup();
                                        return;
                                    }
                                    var remoteFeed = null;
                                    for (var i = 1; i < 6; i++) {
                                        if (mc_rtc_component.feeds[i] != null && mc_rtc_component.feeds[i] != undefined && mc_rtc_component.feeds[i].rfid == unpublished) {
                                            remoteFeed = mc_rtc_component.feeds[i];
                                            break;
                                        }
                                    }
                                    if (remoteFeed != null) {
                                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                        $('#remote' + remoteFeed.rfindex).empty().hide();
                                        $('#videoremote' + remoteFeed.rfindex).empty();
                                        mc_rtc_component.feeds[remoteFeed.rfindex] = null;
                                        remoteFeed.detach();
                                    }
                                } else if (msg["error"] !== undefined && msg["error"] !== null) {
                                    if (msg["error_code"] === 426) {
                                        // This is a "no such room" error: give a more meaningful description
                                        bootbox.alert(
                                            "<p>Apparently room <code>" + myRoomId + "</code> (the one this demo uses as a test room) " +
                                            "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.cfg</code> " +
                                            "configuration file? If not, make sure you copy the details of room <code>" + myRoomId + "</code> " +
                                            "from that sample in your current configuration file, then restart Janus and try again."
                                        );
                                    } else {
                                        bootbox.alert(msg["error"]);
                                    }
                                }
                            }
                        }
                        if (jsep !== undefined && jsep !== null) {
                            Janus.debug("Handling SDP as well...");
                            Janus.debug(jsep);
                            mc_rtc_component.sfutest.handleRemoteJsep({jsep: jsep});
                        }
                    },
                    onlocalstream: function (stream) {
                        Janus.debug(" ::: Got a local stream :::");
                        mc_rtc_component.myStream = stream;
                        Janus.debug(JSON.stringify(stream));
                        $('#videolocal').empty();
                        $('#videojoin').hide();
                        $('#videos').removeClass('hide').show();
                        if ($('#myvideo').length === 0) {
                            $('#videolocal').append('<video class="rounded centered" id="myvideo" width="100%" height="100%" autoplay muted="muted"/>');
                            // Add a 'mute' button
                            $('#videolocal').append('<button class="btn btn-warning btn-xs" id="mute" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;">Mute</button>');
                            $('#mute').click(toggleMute);
                            // Add an 'unpublish' button
                            $('#videolocal').append('<button class="btn btn-warning btn-xs" id="unpublish" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;">Unpublish</button>');
                            $('#unpublish').click(unpublishOwnFeed);
                        }
                        $('#publisher').removeClass('hide').html(mc_rtc_component.myUserName).show();
                        Janus.attachMediaStream($('#myvideo').get(0), stream);
                        $("#myvideo").get(0).muted = "muted";
                        $("#videolocal").parent().parent().block({
                            message: '<b>Publishing...</b>',
                            css: {
                                border: 'none',
                                backgroundColor: 'transparent',
                                color: 'white'
                            }
                        });
                        var videoTracks = stream.getVideoTracks();
                        if (videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
                            // No webcam
                            $('#myvideo').hide();
                            $('#videolocal').append(
                                '<div class="no-video-container">' +
                                '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
                                '<span class="no-video-text" style="font-size: 16px;">No webcam available</span>' +
                                '</div>');
                        }
                    },
                    onremotestream: function (stream) {
                        // The publisher stream is sendonly, we don't expect anything here
                    },
                    oncleanup: function () {
                        Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                        mc_rtc_component.myStream = null;
                        $('#videolocal').html('<button id="publish" class="btn btn-primary">Publish</button>');
                        $('#publish').click(function () {
                            publishOwnFeed(true);
                        });
                        $("#videolocal").parent().parent().unblock();
                        $('#bitrate').parent().parent().addClass('hide');
                        $('#bitrate a').unbind('click');
                    }
                });
            },
            error: function (error) {
                Janus.error(error);
                bootbox.alert(error, function () {
                    window.location.reload();
                });
            },
            destroyed: function () {
                window.location.reload();
            }
        });

    }
};

function checkEnter(field, event) {
    var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
    if (theCode == 13) {
        registerUsername();
        return false;
    } else {
        return true;
    }
}

function registerUsername() {
    if ($('#username').length === 0) {
        // Create fields to register
        $('#register').click(registerUsername);
        $('#username').focus();
    } else {
        // Try a registration
        $('#username').attr('disabled', true);
        $('#register').attr('disabled', true).unbind('click');
        var username = $('#username').val();
        if (username === "") {
            $('#you')
                .removeClass().addClass('label label-warning')
                .html("Insert your display name (e.g., pippo)");
            $('#username').removeAttr('disabled');
            $('#register').removeAttr('disabled').click(registerUsername);
            return;
        }
        if (/[^a-zA-Z0-9]/.test(username)) {
            $('#you')
                .removeClass().addClass('label label-warning')
                .html('Input is not alphanumeric');
            $('#username').removeAttr('disabled').val("");
            $('#register').removeAttr('disabled').click(registerUsername);
            return;
        }
        var register = {
            "request": "join",
            "room": mc_rtc_component.myRoomId,
            "ptype": "publisher",
            "display": username
        };
        mc_rtc_component.myUserName = username;
        mc_rtc_component.sfutest.send({"message": register});
    }
}

function publishOwnFeed(useAudio) {
    // Publish our stream
    $('#publish').attr('disabled', true).unbind('click');
    mc_rtc_component.sfutest.createOffer(
        {
            // Add data:true here if you want to publish datachannels as well
            media: {audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true},	// Publishers are sendonly
            // If you want to test simulcasting (Chrome and Firefox only), then
            // pass a ?simulcast=true when opening this demo page: it will turn
            // the following 'simulcast' property to pass to janus.js to true
            simulcast: mc_rtc_component.doSimulcast,
            success: function (jsep) {
                Janus.debug("Got publisher SDP!");
                Janus.debug(jsep);
                var publish = {"request": "configure", "audio": useAudio, "video": true};
                mc_rtc_component.sfutest.send({"message": publish, "jsep": jsep});
            },
            error: function (error) {
                Janus.error("WebRTC error:", error);
                if (useAudio) {
                    publishOwnFeed(false);
                } else {
                    bootbox.alert("WebRTC error... " + JSON.stringify(error));
                    $('#publish').removeAttr('disabled').click(function () {
                        publishOwnFeed(true);
                    });
                }
            }
        });
}

function toggleMute() {
    var muted = mc_rtc_component.sfutest.isAudioMuted();
    Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
    if (muted)
        mc_rtc_component.sfutest.unmuteAudio();
    else
        mc_rtc_component.sfutest.muteAudio();
    muted = mc_rtc_component.sfutest.isAudioMuted();
    $('#mute').html(muted ? "Unmute" : "Mute");
}

function unpublishOwnFeed() {
    // Unpublish our stream
    $('#unpublish').attr('disabled', true).unbind('click');
    var unpublish = {"request": "unpublish"};
    mc_rtc_component.sfutest.send({"message": unpublish});
}

function newRemoteFeed(id, display) {
    // A new feed has been published, create a new plugin handle and attach to it as a listener
    var remoteFeed = null;
    mc_rtc_component.janusObject.attach(
        {
            plugin: "janus.plugin.videoroom",
            opaqueId: mc_rtc_component.opaqueId,
            success: function (pluginHandle) {
                remoteFeed = pluginHandle;
                remoteFeed.simulcastStarted = false;
                Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                Janus.log("  -- This is a subscriber");
                // We wait for the plugin to send us an offer
                var listen = {
                    "request": "join",
                    "room": mc_rtc_component.myRoomId,
                    "ptype": "listener",
                    "feed": id,
                    "private_id": mc_rtc_component.myPvtId
                };
                // In case you don't want to receive audio, video or data, even if the
                // publisher is sending them, set the 'offer_audio', 'offer_video' or
                // 'offer_data' properties to false (they're true by default), e.g.:
                // 		listen["offer_video"] = false;
                remoteFeed.send({"message": listen});
            },
            error: function (error) {
                Janus.error("  -- Error attaching plugin...", error);
                bootbox.alert("Error attaching plugin... " + error);
            },
            onmessage: function (msg, jsep) {
                Janus.debug(" ::: Got a message (listener) :::");
                Janus.debug(JSON.stringify(msg));
                var event = msg["videoroom"];
                Janus.debug("Event: " + event);
                if (msg["error"] !== undefined && msg["error"] !== null) {
                    bootbox.alert(msg["error"]);
                } else if (event != undefined && event != null) {
                    if (event === "attached") {
                        // Subscriber created and attached
                        for (var i = 1; i < 6; i++) {
                            if (mc_rtc_component.feeds[i] === undefined || mc_rtc_component.feeds[i] === null) {
                                mc_rtc_component.feeds[i] = remoteFeed;
                                remoteFeed.rfindex = i;
                                break;
                            }
                        }
                        remoteFeed.rfid = msg["id"];
                        remoteFeed.rfdisplay = msg["display"];
                        if (remoteFeed.spinner === undefined || remoteFeed.spinner === null) {
                            var target = document.getElementById('videoremote' + remoteFeed.rfindex);
                            remoteFeed.spinner = new Spinner({top: 100}).spin(target);
                        } else {
                            remoteFeed.spinner.spin();
                        }
                        Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
                        $('#remote' + remoteFeed.rfindex).removeClass('hide').html(remoteFeed.rfdisplay).show();
                    } else if (event === "event") {
                        // Check if we got an event on a simulcast-related event from this publisher
                        var substream = msg["substream"];
                        var temporal = msg["temporal"];
                        if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                            if (!remoteFeed.simulcastStarted) {
                                remoteFeed.simulcastStarted = true;
                                // Add some new buttons
                                addSimulcastButtons(remoteFeed.rfindex);
                            }
                            // We just received notice that there's been a switch, update the buttons
                            updateSimulcastButtons(remoteFeed.rfindex, substream, temporal);
                        }
                    } else {
                        // What has just happened?
                    }
                }
                if (jsep !== undefined && jsep !== null) {
                    Janus.debug("Handling SDP as well...");
                    Janus.debug(jsep);
                    // Answer and attach
                    remoteFeed.createAnswer(
                        {
                            jsep: jsep,
                            // Add data:true here if you want to subscribe to datachannels as well
                            // (obviously only works if the publisher offered them in the first place)
                            media: {audioSend: false, videoSend: false},	// We want recvonly audio/video
                            success: function (jsep) {
                                Janus.debug("Got SDP!");
                                Janus.debug(jsep);
                                var body = {"request": "start", "room": mc_rtc_component.myRoomId};
                                remoteFeed.send({"message": body, "jsep": jsep});
                            },
                            error: function (error) {
                                Janus.error("WebRTC error:", error);
                                bootbox.alert("WebRTC error... " + JSON.stringify(error));
                            }
                        });
                }
            },
            webrtcState: function (on) {
                Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
            },
            onlocalstream: function (stream) {
                // The subscriber stream is recvonly, we don't expect anything here
            },
            onremotestream: function (stream) {
                Janus.debug("Remote feed #" + remoteFeed.rfindex);
                if ($('#remotevideo' + remoteFeed.rfindex).length === 0) {
                    // No remote video yet
                    $('#videoremote' + remoteFeed.rfindex).append('<video class="rounded centered" id="waitingvideo' + remoteFeed.rfindex + '" width=320 height=240 />');
                    $('#videoremote' + remoteFeed.rfindex).append('<video class="rounded centered relative hide" id="remotevideo' + remoteFeed.rfindex + '" width="100%" height="100%" autoplay/>');
                }
                $('#videoremote' + remoteFeed.rfindex).append(
                    '<span class="label label-primary hide" id="curres' + remoteFeed.rfindex + '" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;"></span>' +
                    '<span class="label label-info hide" id="curbitrate' + remoteFeed.rfindex + '" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;"></span>');
                // Show the video, hide the spinner and show the resolution when we get a playing event
                $("#remotevideo" + remoteFeed.rfindex).bind("playing", function () {
                    if (remoteFeed.spinner !== undefined && remoteFeed.spinner !== null)
                        remoteFeed.spinner.stop();
                    remoteFeed.spinner = null;
                    $('#waitingvideo' + remoteFeed.rfindex).remove();
                    $('#remotevideo' + remoteFeed.rfindex).removeClass('hide');
                    var width = this.videoWidth;
                    var height = this.videoHeight;
                    $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                    if (adapter.browserDetails.browser === "firefox") {
                        // Firefox Stable has a bug: width and height are not immediately available after a playing
                        setTimeout(function () {
                            var width = $("#remotevideo" + remoteFeed.rfindex).get(0).videoWidth;
                            var height = $("#remotevideo" + remoteFeed.rfindex).get(0).videoHeight;
                            $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                        }, 2000);
                    }
                });
                Janus.attachMediaStream($('#remotevideo' + remoteFeed.rfindex).get(0), stream);
                var videoTracks = stream.getVideoTracks();
                if (videoTracks === null || videoTracks === undefined || videoTracks.length === 0 || videoTracks[0].muted) {
                    // No remote video
                    $('#remotevideo' + remoteFeed.rfindex).hide();
                    $('#videoremote' + remoteFeed.rfindex).append(
                        '<div class="no-video-container">' +
                        '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
                        '<span class="no-video-text" style="font-size: 16px;">No remote video available</span>' +
                        '</div>');
                }
                if (adapter.browserDetails.browser === "chrome" || adapter.browserDetails.browser === "firefox" ||
                    adapter.browserDetails.browser === "safari") {
                    $('#curbitrate' + remoteFeed.rfindex).removeClass('hide').show();
                    mc_rtc_component.bitrateTimer[remoteFeed.rfindex] = setInterval(function () {
                        // Display updated bitrate, if supported
                        var bitrate = remoteFeed.getBitrate();
                        $('#curbitrate' + remoteFeed.rfindex).text(bitrate);
                        // Check if the resolution changed too
                        var width = $("#remotevideo" + remoteFeed.rfindex).get(0).videoWidth;
                        var height = $("#remotevideo" + remoteFeed.rfindex).get(0).videoHeight;
                        if (width > 0 && height > 0)
                            $('#curres' + remoteFeed.rfindex).removeClass('hide').text(width + 'x' + height).show();
                    }, 1000);
                }
            },
            oncleanup: function () {
                Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                if (remoteFeed.spinner !== undefined && remoteFeed.spinner !== null)
                    remoteFeed.spinner.stop();
                remoteFeed.spinner = null;
                $('#waitingvideo' + remoteFeed.rfindex).remove();
                $('#curbitrate' + remoteFeed.rfindex).remove();
                $('#curres' + remoteFeed.rfindex).remove();
                if (mc_rtc_component.bitrateTimer[remoteFeed.rfindex] !== null && mc_rtc_component.bitrateTimer[remoteFeed.rfindex] !== null)
                    clearInterval(mc_rtc_component.bitrateTimer[remoteFeed.rfindex]);
                mc_rtc_component.bitrateTimer[remoteFeed.rfindex] = null;
                remoteFeed.simulcastStarted = false;
                $('#simulcast' + remoteFeed.rfindex).remove();
            }
        });
}

// Helper to parse query string
function getQueryStringValue(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Helpers to create Simulcast-related UI, if enabled
function addSimulcastButtons(feed) {
    var index = feed;
    $('#remote' + index).parent().append(
        '<div id="simulcast' + index + '" class="btn-group-vertical btn-group-vertical-xs pull-right">' +
        '	<div class"row">' +
        '		<div class="btn-group btn-group-xs" style="width: 100%">' +
        '			<button id="sl' + index + '-2" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to higher quality" style="width: 33%">SL 2</button>' +
        '			<button id="sl' + index + '-1" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to normal quality" style="width: 33%">SL 1</button>' +
        '			<button id="sl' + index + '-0" type="button" class="btn btn-primary" data-toggle="tooltip" title="Switch to lower quality" style="width: 34%">SL 0</button>' +
        '		</div>' +
        '	</div>' +
        '	<div class"row">' +
        '		<div class="btn-group btn-group-xs" style="width: 100%">' +
        '			<button id="tl' + index + '-2" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 2" style="width: 34%">TL 2</button>' +
        '			<button id="tl' + index + '-1" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 1" style="width: 33%">TL 1</button>' +
        '			<button id="tl' + index + '-0" type="button" class="btn btn-primary" data-toggle="tooltip" title="Cap to temporal layer 0" style="width: 33%">TL 0</button>' +
        '		</div>' +
        '	</div>' +
        '</div>'
    );
    // Enable the VP8 simulcast selection buttons
    $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Switching simulcast substream, wait for it... (lower quality)", null, {timeOut: 2000});
            if (!$('#sl' + index + '-2').hasClass('btn-success'))
                $('#sl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
            if (!$('#sl' + index + '-1').hasClass('btn-success'))
                $('#sl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
            $('#sl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
            mc_rtc_component.feeds[index].send({message: {request: "configure", substream: 0}});
        });
    $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Switching simulcast substream, wait for it... (normal quality)", null, {timeOut: 2000});
            if (!$('#sl' + index + '-2').hasClass('btn-success'))
                $('#sl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
            $('#sl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
            if (!$('#sl' + index + '-0').hasClass('btn-success'))
                $('#sl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
            mc_rtc_component.feeds[index].send({message: {request: "configure", substream: 1}});
        });
    $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Switching simulcast substream, wait for it... (higher quality)", null, {timeOut: 2000});
            $('#sl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
            if (!$('#sl' + index + '-1').hasClass('btn-success'))
                $('#sl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
            if (!$('#sl' + index + '-0').hasClass('btn-success'))
                $('#sl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
            mc_rtc_component.feeds[index].send({message: {request: "configure", substream: 2}});
        });
    $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Capping simulcast temporal layer, wait for it... (lowest FPS)", null, {timeOut: 2000});
            if (!$('#tl' + index + '-2').hasClass('btn-success'))
                $('#tl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
            if (!$('#tl' + index + '-1').hasClass('btn-success'))
                $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
            $('#tl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
            mc_rtc_component.feeds[index].send({message: {request: "configure", temporal: 0}});
        });
    $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Capping simulcast temporal layer, wait for it... (medium FPS)", null, {timeOut: 2000});
            if (!$('#tl' + index + '-2').hasClass('btn-success'))
                $('#tl' + index + '-2').removeClass('btn-primary btn-info').addClass('btn-primary');
            $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-info');
            if (!$('#tl' + index + '-0').hasClass('btn-success'))
                $('#tl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
            mc_rtc_component.feeds[index].send({message: {request: "configure", temporal: 1}});
        });
    $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary')
        .unbind('click').click(function () {
            toastr.info("Capping simulcast temporal layer, wait for it... (highest FPS)", null, {timeOut: 2000});
            $('#tl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-info');
            if (!$('#tl' + index + '-1').hasClass('btn-success'))
                $('#tl' + index + '-1').removeClass('btn-primary btn-info').addClass('btn-primary');
            if (!$('#tl' + index + '-0').hasClass('btn-success'))
                $('#tl' + index + '-0').removeClass('btn-primary btn-info').addClass('btn-primary');
            mc_rtc_component.feeds[index].send({message: {request: "configure", temporal: 2}});
        });
}

function updateSimulcastButtons(feed, substream, temporal) {
    // Check the substream
    var index = feed;
    if (substream === 0) {
        toastr.success("Switched simulcast substream! (lower quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
    } else if (substream === 1) {
        toastr.success("Switched simulcast substream! (normal quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    } else if (substream === 2) {
        toastr.success("Switched simulcast substream! (higher quality)", null, {timeOut: 2000});
        $('#sl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#sl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#sl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    }
    // Check the temporal layer
    if (temporal === 0) {
        toastr.success("Capped simulcast temporal layer! (lowest FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-0').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
    } else if (temporal === 1) {
        toastr.success("Capped simulcast temporal layer! (medium FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-1').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    } else if (temporal === 2) {
        toastr.success("Capped simulcast temporal layer! (highest FPS)", null, {timeOut: 2000});
        $('#tl' + index + '-2').removeClass('btn-primary btn-info btn-success').addClass('btn-success');
        $('#tl' + index + '-1').removeClass('btn-primary btn-success').addClass('btn-primary');
        $('#tl' + index + '-0').removeClass('btn-primary btn-success').addClass('btn-primary');
    }
}

function trace(arg) {
    var now = (window.performance.now() / 1000).toFixed(3);
    console.log(now + ': ', arg);
}