/**
 * 腾讯云云函数 SCF - 接收问卷数据并写入飞书多维表格
 *
 * 环境变量（需在腾讯云 SCF 控制台配置）：
 * - FEISHU_APP_ID
 * - FEISHU_APP_SECRET
 * - FEISHU_APP_TOKEN
 * - FEISHU_TABLE_ID
 */

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth error: ${data.msg || JSON.stringify(data)}`);
  }
  return data.tenant_access_token;
}

async function createRecord(token, appToken, tableId, fields) {
  const res = await fetch(
    `${FEISHU_BASE}/base/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu create record error: ${data.msg || JSON.stringify(data)}`);
  }
  return data.data;
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
