var g_mc_ws_component = {
    ws: null,
    url: 'ws://moberian.iptime.org:8099/ws/tapi',
    joinUrl: null,
    setJoinUrl: function(url){
        this.joinUrl = url;
    },
    connect: function () {
        if (this.ws == null) {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = this.onConnected;
            this.ws.onmessage = this.onMessage;
            this.ws.onclose = this.onClosed;
        }
    },
    sendMessage: function (txt) {
        if (this.ws != null) {
            //console.log('sending message:' + txt);
            this.ws.send(txt);
        } else {
            alert('connection not established, please connect.');
        }
    },
    disconnect: function () {
        if (this.ws != null) {
            this.ws.close();
            this.ws = null;
        }
    },
    onConnected: function () {
        console.log('ws connected');
    },
    onMessage: function (event) {
        console.log(event);
        if(event.data){
            var parsed = JSON.parse(event.data);
            switch(parsed.t){
                case 'CR':
                    if(g_mc_ws_component.onCreateRoomSuccess){
                        g_mc_ws_component.onCreateRoomSuccess(parsed);
                    }
                    break;
                case 'JR':
                    if(g_mc_ws_component.onJoinRoomSuccess){
                        g_mc_ws_component.onJoinRoomSuccess(parsed);
                    }
                    break;
                case 'AR':
                    if(g_mc_ws_component.onAnswerRoomSuccess){
                        g_mc_ws_component.onAnswerRoomSuccess(parsed);
                    }
                    break;
            }
        }
    },
    onClosed: function (event) {
        console.log(event);
    },
    createRoom: function (t, u, s) {
        var tmp = {
            t: 'CR',
            s: 0,
            d1: t,
            d2: u,
            d3: new Date().getTime(),
            d4: s
        };
        this.sendMessage(JSON.stringify(tmp));
    },
    joinRoom: function (u, r) {
        var tmp = {
            t: 'JR',
            s: 0,
            d1: u,
            d2: r
        };
        this.sendMessage(JSON.stringify(tmp));
    },
    answerRoom: function (u, s) {
        var tmp = {
            t: 'AR',
            s: 0,
            d1: u,
            d2: s
        };
        this.sendMessage(JSON.stringify(tmp));
    },
    onCreateRoomSuccess: null,
    onJoinRoomSuccess: null,
    onAnswerRoomSuccess: null
};