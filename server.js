const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = []; 
let drawings = {}; 
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

    if (players.length >= 2) {
        socket.emit('system_msg', '房间已满，请稍后再试');
        return;
    }

    // 【优化点】智能分配角色，防止退出后重进导致两个相同角色
    const isTopTaken = players.some(p => p.role === 'top');
    const role = isTopTaken ? 'bottom' : 'top';
    
    // 【新增】wantsToContinue 记录玩家是否准备好下一局
    players.push({ id: socket.id, role: role, wantsToContinue: false });
    
    socket.emit('assign_role', role); 
    socket.emit('system_msg', `你是玩家 ${players.length}。等待对手...`);

    if (players.length === 2) {
        startGame();
    }

    // 接收玩家提交的画作
    socket.on('submit_drawing', (imageData) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            drawings[player.role] = imageData; 
            
            if (Object.keys(drawings).length === 2) {
                io.emit('game_over', drawings);
            } else {
                socket.emit('system_msg', '提交成功！等待对方画完...');
            }
        }
    });

    // 【核心新增 1】处理玩家点击“继续游戏”
    socket.on('request_continue', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.wantsToContinue = true; // 标记这名玩家已准备好
            
            // 检查是不是两个人都点继续了
            const readyCount = players.filter(p => p.wantsToContinue).length;
            if (readyCount === 2 && players.length === 2) {
                startGame(); // 两人都准备好了，开启新一局！
            }
        }
    });

    // 【核心新增 2】处理玩家点击“退出游戏”
    socket.on('request_exit', () => {
        socket.disconnect(); // 主动断开连接，会自动触发下方的 disconnect 事件
    });

    // 玩家断开连接 (无论是掉线还是点退出)
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        drawings = {}; // 清空画布数据
        // 通知剩下的那个人对方已离开
        io.emit('system_msg', '对方退出了游戏，等待新玩家...');
        io.emit('reset_game'); 
    });
});

// 封装一个发新题的函数
function startGame() {
    players.forEach(p => p.wantsToContinue = false); // 重置准备状态
    drawings = {}; // 清空上一局画作
    const word = words[Math.floor(Math.random() * words.length)];
    io.emit('game_start', word); 
}

const port = process.env.PORT || 3000;
const listener = http.listen(port, () => {
    console.log('游戏服务器启动在端口 ' + listener.address().port);
});
