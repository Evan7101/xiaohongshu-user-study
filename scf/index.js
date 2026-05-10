/**
 * 腾讯云云函数 SCF - 接收问卷数据并写入飞书多维表格
 * 使用 Node.js https 模块（兼容 SCF 运行时）
 *
 * 环境变量（需在腾讯云 SCF 控制台配置）：
 * - FEISHU_APP_ID
 * - FEISHU_APP_SECRET
 * - FEISHU_APP_TOKEN
 * - FEISHU_TABLE_ID
 */

const https = require('https');

const FEISHU_BASE = 'open.feishu.cn';

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function getTenantAccessToken(appId, appSecret) {
  const result = await httpsRequest({
    hostname: FEISHU_BASE,
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  }, JSON.stringify({ app_id: appId, app_secret: appSecret }));

  if (result.body.code !== 0) {
    throw new Error(`Feishu auth error: ${result.body.msg || JSON.stringify(result.body)}`);
  }
  return result.body.tenant_access_token;
}

async function createRecord(token, appToken, tableId, fields) {
  const result = await httpsRequest({
    hostname: FEISHU_BASE,
    path: `/open-apis/base/v1/apps/${appToken}/tables/${tableId}/records`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }, JSON.stringify({ fields }));

  if (result.body.code !== 0) {
    throw new Error(`Feishu create record error: ${result.body.msg || JSON.stringify(result.body)}`);
  }
  return result.body.data;
}

exports.main_handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      FEISHU_APP_ID,
      FEISHU_APP_SECRET,
      FEISHU_APP_TOKEN,
      FEISHU_TABLE_ID,
    } = process.env;

    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !FEISHU_APP_TOKEN || !FEISHU_TABLE_ID) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing Feishu environment variables' }),
      };
    }

    const token = await getTenantAccessToken(FEISHU_APP_ID, FEISHU_APP_SECRET);

    const fields = {};
    fields['提交时间'] = body.timestamp || new Date().toISOString();
    fields['受访者ID'] = body.respondentId || 'anonymous';

    if (body.sectionA && Array.isArray(body.sectionA)) {
      body.sectionA.forEach((userRating, idx) => {
        const prefix = `用户${idx + 1}`;
        fields[`${prefix}_A1_整体自然度`] = userRating.A1 || '';
        fields[`${prefix}_A2_人设匹配`] = userRating.A2 || '';
        fields[`${prefix}_A3_生活逻辑`] = userRating.A3 || '';
        fields[`${prefix}_A4_图文匹配`] = userRating.A4 || '';
        fields[`${prefix}_A5_帖子连贯`] = userRating.A5 || '';
        fields[`${prefix}_开放题`] = userRating.comment || '';
      });
    }

    if (body.sectionB && Array.isArray(body.sectionB)) {
      body.sectionB.forEach((imgJudge, idx) => {
        fields[`Img${String(idx + 1).padStart(2, '0')}`] = imgJudge.value || '';
      });
    }

    if (body.postsurvey) {
      fields['Q6_小红书使用频率'] = body.postsurvey.q6 || '';
      fields['Q9_判别自信度'] = body.postsurvey.q9 || '';
    }

    const record = await createRecord(token, FEISHU_APP_TOKEN, FEISHU_TABLE_ID, fields);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ success: true, recordId: record.record_id }),
    };
  } catch (err) {
    console.error('Submit error:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
