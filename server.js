const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// 【核心改造】所有的游戏状态，现在按房间 ID 独立存储
const rooms = {}; 
const MAX_ROOMS = 3;
const MAX_ROUNDS = 6; 

const words = [
    "外星人", "雪人", "稻草人", "机器人", "美人鱼", "半人马", "奥特曼", "蜘蛛侠", "蝙蝠侠", "孙悟空", 
    "猪八戒", "小黄人", "海绵宝宝", "派大星", "皮卡丘", "马里奥", 
    "霸王龙", "长颈鹿", "大象", "斑马", "企鹅", "袋鼠", "鸵鸟", "火烈鸟", "猫头鹰", "青蛙", 
    "鳄鱼", "老虎", "狮子", "大熊猫", "大猩猩", "猴子", "兔子", "绵羊", "奶牛", "骆驼", 
    "羊驼", "独角兽", "喷火龙", "海马", "大章鱼", "水母", "毛毛虫", 
    "大火箭", "航天飞机", "热气球", "直升机", "帆船", "潜水艇", "摩天轮", "埃菲尔铁塔", "自由女神像", "东方明珠", 
    "埃及金字塔", "灯塔", "大风车", "城堡", "红绿灯", "电线杆", 
    "冰淇淋甜筒", "巨无霸汉堡", "双层大蛋糕", "大圣代", "冰糖葫芦", "烤肉串", "珍珠奶茶", "大蘑菇", "参天大树", "向日葵", 
    "仙人掌", "食人花", "路障雪糕筒", "立式电风扇", "落地灯", "抽水马桶", "双开门冰箱", "滚筒洗衣机", "自动售货机", "夹娃娃机", 
    "落地大摆钟", "吉他", "麦克风", "高脚杯", "奖杯", "沙漏", "香水瓶", "蒙娜丽莎", "皮卡丘"
];

// 广播最新的大厅房间列表给所有不在游戏中的人
function broadcastRooms() {
    const roomList = Object.keys(rooms).map(id => ({
        id: id,
        ownerName: rooms[id].ownerName,
        playerCount: rooms[id].players.length
    }));
    io.emit('room_list_update', roomList);
}

// 初始化某个房间的游戏
function initGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    let shuffled = [...words].sort(() => 0.5 - Math.random());
    room.selectedWords = shuffled.slice(0, MAX_ROUNDS);
    room.currentRound = 1;
    room.gallery = [];
    startRound(roomId);
}

// 开始某个房间的单回合
function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.players.forEach(p => p.wantsToContinue = false); 
    room.drawings = {}; 
    room.gameState = 'playing';

    // 随机分配上下半区
    const isTopFirst = Math.random() > 0.5;
    room.players[0].role = isTopFirst ? 'top' : 'bottom';
    room.players[1].role = isTopFirst ? 'bottom' : 'top';

    // 分别通知房间里的两个玩家
    room.players.forEach(p => {
        const partner = room.players.find(other => other.id !== p.id);
        io.to(p.id).emit('game_start', {
            word: room.selectedWords[room.currentRound - 1],
            round: room.currentRound,
            total: MAX_ROUNDS,
            role: p.role,
            partnerName: partner.name,
            partnerAvatar: partner.avatar
        });
    });
}

io.on('connection', (socket) => {
    // 新用户连入，先给他发一份当前的大厅列表
    socket.emit('room_list_update', Object.keys(rooms).map(id => ({
        id: id, ownerName: rooms[id].ownerName, playerCount: rooms[id].players.length
    })));

    // 1. 创建房间
    socket.on('create_room', (userProfile) => {
        if (Object.keys(rooms).length >= MAX_ROOMS) {
            return socket.emit('system_msg', '当前服务器房间已达上限(3个)，请稍后或加入现有房间');
        }
        
        const roomId = Math.random().toString(36).substring(2, 8); // 生成随机房间号
        
        rooms[roomId] = {
            id: roomId,
            ownerId: socket.id,
            ownerName: userProfile.name,
            players: [{ id: socket.id, role: 'waiting', wantsToContinue: false, ...userProfile }],
            gameState: 'waiting',
            drawings: {},
            gallery: [],
            currentRound: 1,
            selectedWords: []
        };

        socket.join(roomId); // Socket 加入专属频道
        socket.roomId = roomId; // 在 socket 对象上记录他所在的房间
        
        socket.emit('room_joined', { roomId, isOwner: true });
        broadcastRooms();
    });

    // 2. 加入房间
    socket.on('join_room', (data) => {
        const { roomId, userProfile } = data;
        const room = rooms[roomId];

        if (!room) return socket.emit('system_msg', '房间不存在或已解散');
        if (room.players.length >= 2) return socket.emit('system_msg', '该房间已满');

        room.players.push({ id: socket.id, role: 'waiting', wantsToContinue: false, ...userProfile });
        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit('room_joined', { roomId, isOwner: false });
        broadcastRooms();

        // 人齐了，发车！
        if (room.players.length === 2) {
            initGame(roomId);
        }
    });

    // 3. 接收画作 (按房间处理)
    socket.on('submit_drawing', (imageData) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            room.drawings[player.role] = imageData; 
            socket.to(room.id).emit('partner_submitted'); // 只发给这个房间里的其他人
            
            if (Object.keys(room.drawings).length === 2) {
                room.gameState = 'settlement';
                room.gallery.push({
                    word: room.selectedWords[room.currentRound - 1],
                    top: room.drawings.top,
                    bottom: room.drawings.bottom
                });
                io.to(room.id).emit('game_over', room.drawings);
            } else {
                socket.emit('system_msg', '提交成功！等待对方画完...');
            }
        }
    });

    // 4. 处理继续请求
    socket.on('request_continue', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.wantsToContinue = true; 
            socket.to(room.id).emit('partner_continued');
            
            const readyCount = room.players.filter(p => p.wantsToContinue).length;
            if (readyCount === 2) {
                if (room.gameState === 'settlement') {
                    if (room.currentRound < MAX_ROUNDS) {
                        room.currentRound++;
                        startRound(room.id);
                    } else {
                        room.gameState = 'gallery';
                        room.players.forEach(p => p.wantsToContinue = false); 
                        io.to(room.id).emit('show_gallery', room.gallery);
                    }
                } else if (room.gameState === 'gallery') {
                    initGame(room.id);
                }
            }
        }
    });

    // 5. 退出/断开连接
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        
        if (room) {
            // 如果房主退出了，解散房间
            if (room.ownerId === socket.id) {
                socket.to(roomId).emit('room_closed', '房主已解散房间');
                delete rooms[roomId];
            } else {
                // 如果是客人退出了，房间重置为等待状态
                room.players = room.players.filter(p => p.id !== socket.id);
                room.drawings = {};
                room.gameState = 'waiting';
                socket.to(roomId).emit('room_closed', '对方已离开，正在等待新玩家加入...');
            }
            broadcastRooms();
        }
    });
});

const port = process.env.PORT || 3000;
const listener = http.listen(port, () => {
    console.log('游戏服务器启动在端口 ' + listener.address().port);
});
