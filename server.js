const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = []; 
let drawings = {}; 
let gallery = []; // 【新增】用于存放这一轮 6 张画作的画廊
let currentRound = 1;
const MAX_ROUNDS = 6; // 【新增】最大回合数
let selectedWords = []; // 当前这局选中的 6 个词
let gameState = 'waiting'; // 状态机: waiting, playing, settlement, gallery

// 用户提供的完整题库
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

// 初始化/重置一整局游戏（6轮）
function initGame() {
    // 随机洗牌并抽取 6 个词
    let shuffled = [...words].sort(() => 0.5 - Math.random());
    selectedWords = shuffled.slice(0, MAX_ROUNDS);
    currentRound = 1;
    gallery = [];
    startRound();
}

// 开始单个回合
function startRound() {
    players.forEach(p => p.wantsToContinue = false); 
    drawings = {}; 
    gameState = 'playing';
    io.emit('game_start', {
        word: selectedWords[currentRound - 1],
        round: currentRound,
        total: MAX_ROUNDS
    }); 
}

io.on('connection', (socket) => {
    if (players.length >= 2) {
        socket.emit('system_msg', '房间已满，请稍后再试');
        return;
    }

    const isTopTaken = players.some(p => p.role === 'top');
    const role = isTopTaken ? 'bottom' : 'top';
    players.push({ id: socket.id, role: role, wantsToContinue: false });
    
    socket.emit('assign_role', role); 
    socket.emit('system_msg', `你是玩家 ${players.length}。等待对手...`);

    // 凑齐两人，开启全新的一局
    if (players.length === 2) {
        initGame();
    }

    // 接收画作
    socket.on('submit_drawing', (imageData) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            drawings[player.role] = imageData; 
            
            // 【核心新增】广播给对方：他已经交卷了
            socket.broadcast.emit('partner_submitted');
            
            if (Object.keys(drawings).length === 2) {
                gameState = 'settlement';
                // 存入画廊记录
                gallery.push({
                    word: selectedWords[currentRound - 1],
                    top: drawings.top,
                    bottom: drawings.bottom
                });
                io.emit('game_over', drawings);
            } else {
                socket.emit('system_msg', '提交成功！等待对方画完...');
            }
        }
    });

    // 处理玩家点击“继续”或“再来一轮”
    socket.on('request_continue', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.wantsToContinue = true; 
            // 【核心新增】广播给对方：他已经点继续了
            socket.broadcast.emit('partner_continued');
            
            const readyCount = players.filter(p => p.wantsToContinue).length;
            if (readyCount === 2 && players.length === 2) {
                // 两人都准备好了，判断接下来的流程
                if (gameState === 'settlement') {
                    if (currentRound < MAX_ROUNDS) {
                        // 还没到6轮，继续下一轮
                        currentRound++;
                        startRound();
                    } else {
                        // 6轮结束，进入最终画展！
                        gameState = 'gallery';
                        players.forEach(p => p.wantsToContinue = false); // 重置准备状态，给画展页用
                        io.emit('show_gallery', gallery);
                    }
                } else if (gameState === 'gallery') {
                    // 在画展页面双方都点了“再来一轮”，完全重置游戏
                    initGame();
                }
            }
        }
    });

    socket.on('request_exit', () => {
        socket.disconnect(); 
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        drawings = {}; 
        gameState = 'waiting';
        io.emit('system_msg', '对方退出了游戏，等待新玩家...');
        io.emit('reset_game'); 
    });
});

const port = process.env.PORT || 3000;
const listener = http.listen(port, () => {
    console.log('游戏服务器启动在端口 ' + listener.address().port);
});
