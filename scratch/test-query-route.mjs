async function testTenderQueryApi() {
  try {
    const res = await fetch('http://localhost:3000/api/tender-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello, what is the role of this system?' }],
        tenders: [],
        files: [],
      }),
    })

    const data = await res.json()
    console.log('Status code:', res.status)
    console.log('API Response:', JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('Fetch error:', err.message)
  }
}

testTenderQueryApi()
