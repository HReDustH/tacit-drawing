const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 让服务器对外公开 public 文件夹里的静态网页
app.use(express.static('public'));

let players = []; // 记录当前房间的玩家
let drawings = {}; // 保存画作
const words = ["外星人", "雪人", "稻草人", "机器人", "美人鱼", "半人马", "奥特曼", "蜘蛛侠", "蝙蝠侠", "孙悟空", 
    "猪八戒", "小黄人", "海绵宝宝", "派大星", "皮卡丘", "马里奥", 

    // 动物与怪物（重点突出头颈和腿脚的特征）
    "霸王龙", "长颈鹿", "大象", "斑马", "企鹅", "袋鼠", "鸵鸟", "火烈鸟", "猫头鹰", "青蛙", 
    "鳄鱼", "老虎", "狮子", "大熊猫", "大猩猩", "猴子", "兔子", "绵羊", "奶牛", "骆驼", 
    "羊驼", "独角兽", "喷火龙", "海马", "大章鱼", "水母", "毛毛虫", 

    // 垂直特征明显的建筑与交通工具
    "大火箭", "航天飞机", "热气球", "直升机", "帆船", "潜水艇", "摩天轮", "埃菲尔铁塔", "自由女神像", "东方明珠", 
    "埃及金字塔", "灯塔", "大风车", "城堡", "红绿灯", "电线杆", 

    // 有明显上下结构的日常物品与食物
    "冰淇淋甜筒", "巨无霸汉堡", "双层大蛋糕", "大圣代", "冰糖葫芦", "烤肉串", "珍珠奶茶", "大蘑菇", "参天大树", "向日葵", 
    "仙人掌", "食人花", "路障雪糕筒", "立式电风扇", "落地灯", "抽水马桶", "双开门冰箱", "滚筒洗衣机", "自动售货机", "夹娃娃机", 
    "落地大摆钟", "吉他", "麦克风", "高脚杯", "奖杯", "沙漏", "香水瓶", "蒙娜丽莎", "皮卡丘"];

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
