const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 让服务器对外公开 public 文件夹里的静态网页
app.use(express.static('public'));

let players = []; // 记录当前房间的玩家
let drawings = {}; // 保存画作
const words = ["蛇", "大象", "美人鱼", "长颈鹿", "奥特曼", "马桶", "高跟鞋", "汉堡包", "自行车", "外星人", "企鹅", "恐龙", "蒙娜丽莎", "皮卡丘"];

io.on('connection', (socket) => {
    console.log('新玩家加入:', socket.id);

    // 最多只允许两人测试
    if (players.length >= 2) {
        socket.emit('system_msg', '房间已满，请稍后再试');
        return;
    }

    // 分配角色：第一个是 top (上半部)，第二个是 bottom (下半部)
    const role = players.length === 0 ? 'top' : 'bottom';
    players.push({ id: socket.id, role: role });
    
    // 明确告诉客户端它被分配了哪个区域
    socket.emit('assign_role', role); 
    socket.emit('system_msg', `你是玩家 ${players.length}。等待对手...`);

    // 如果凑齐两人，开始游戏！
    if (players.length === 2) {
        const word = words[Math.floor(Math.random() * words.length)];
        io.emit('game_start', word); // 广播给所有人：游戏开始，题目发下去
    }

    // 接收玩家提交的画作
    socket.on('submit_drawing', (imageData) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            drawings[player.role] = imageData; // 保存他的画（按 top 或 bottom 存）
            
            // 检查是不是两个人都交卷了
            if (Object.keys(drawings).length === 2) {
                // 都交了，把两张图发给所有人
                io.emit('game_over', drawings);
                drawings = {}; // 清空，准备下一局
            } else {
                // 只有一个人交了
                socket.emit('system_msg', '提交成功！等待对方画完...');
            }
        }
    });

    // 玩家断开连接
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        drawings = {}; 
        io.emit('system_msg', '对方逃跑了，等待新玩家...');
        io.emit('reset_game'); // 通知剩下的玩家重置界面
    });
});

// Render.com 会自动分配一个 PORT 环境变量，必须这么写
const port = process.env.PORT || 3000;
const listener = http.listen(port, () => {
    console.log('游戏服务器启动在端口 ' + listener.address().port);
});
