import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export default function App() {

  // ---------------- AUTH STATE ----------------
  const [token,setToken] = useState(null)
  const [email,setEmail] = useState("")
  const [password,setPassword] = useState("")
  const [org,setOrg] = useState("")
  const [registerEmail,setRegisterEmail] = useState("")
  const [registerPassword,setRegisterPassword] = useState("")

  // ---------------- DASHBOARD STATE ----------------
  const [file,setFile] = useState(null)
  const [stats,setStats] = useState(null)
  const [loading,setLoading] = useState(false)
  const [userCount,setUserCount] = useState(0)
  const [userCountUpdating,setUserCountUpdating] = useState(false)

  // ---------------- LOGIN ----------------
  const login = async()=>{

    const res = await fetch("http://127.0.0.1:5000/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    })

    const data = await res.json()

    if(data.token)
      setToken(data.token)
    else
      alert(data.error)
  }

  // ---------------- REGISTER ----------------
  const register = async()=>{
    if(!org || !registerEmail || !registerPassword){
      alert("Fill organization, email, and password")
      return
    }

    const res = await fetch("http://127.0.0.1:5000/register",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        org,
        email:registerEmail,
        password:registerPassword
      })
    })

    const data = await res.json()

    if(res.ok){
      alert("Registered successfully. You can now log in.")
      setEmail(registerEmail)
      setPassword(registerPassword)
      setOrg("")
      setRegisterEmail("")
      setRegisterPassword("")
    }else{
      alert(data.error || "Registration failed")
    }
  }

  // ---------------- LOAD ANALYTICS ----------------
  const loadStats = async()=>{

    const res = await fetch("http://127.0.0.1:5000/analytics",{
      headers:{ Authorization:`Bearer ${token}` }
    })

    const data = await res.json()
    setStats(data)
  }

  // ---------------- LOAD LIVE USER COUNT ----------------
  const loadLiveUserCount = async()=>{

    try {
      setUserCountUpdating(true)
      const res = await fetch("http://127.0.0.1:5000/user-count",{
        headers:{ Authorization:`Bearer ${token}` }
      })

      const data = await res.json()
      if(data.user_count !== undefined){
        setUserCount(data.user_count)
      }
      setUserCountUpdating(false)
    } catch(error) {
      console.error("Failed to fetch user count:", error)
      setUserCountUpdating(false)
    }
  }

  // ---------------- UPLOAD FILE ----------------
  const analyze = async()=>{

    if(!file) return alert("Upload CSV first")

    setLoading(true)

    const form = new FormData()
    form.append("file",file)

    await fetch("http://127.0.0.1:5000/analyze",{
      method:"POST",
      headers:{ Authorization:`Bearer ${token}` },
      body:form
    })

    await loadStats()
    setLoading(false)
  }

  // load analytics after login
  useEffect(()=>{
    if(token) {
      loadStats()
      loadLiveUserCount()
      
      // Poll for live user count every 3 seconds
      const interval = setInterval(()=>{
        loadLiveUserCount()
      }, 3000)
      
      return ()=>clearInterval(interval)
    }
  },[token])


  // =========================================================
  // LOGIN SCREEN
  // =========================================================

  if(!token)
  return(
    <div style={styles.center}>

      <div style={styles.card}>
        <h2>Finance SaaS Login</h2>

        <input
          placeholder="Email"
          onChange={e=>setEmail(e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Password"
          type="password"
          onChange={e=>setPassword(e.target.value)}
          style={styles.input}
        />

        <button onClick={login} style={styles.button}>
          Login
        </button>
      </div>

      <div style={styles.card}>
        <h2>Register</h2>

        <input
          placeholder="Organization"
          value={org}
          onChange={e=>setOrg(e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Email"
          value={registerEmail}
          onChange={e=>setRegisterEmail(e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Password"
          type="password"
          value={registerPassword}
          onChange={e=>setRegisterPassword(e.target.value)}
          style={styles.input}
        />

        <button onClick={register} style={styles.button}>
          Register
        </button>
      </div>

    </div>
  )


  // =========================================================
  // DASHBOARD SCREEN
  // =========================================================

  return(
    <div style={styles.layout}>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <h2>FinancePro</h2>
        <p>Dashboard</p>
        <p>Reports</p>
        <p>Analytics</p>
      </div>


      {/* Main Content */}
      <div style={styles.main}>

        <h1>Dashboard</h1>

        {/* Live User Count */}
        <div style={styles.liveUserCard}>
          <h3>Live Active Users</h3>
          <div style={styles.userCountDisplay}>
            <span style={styles.userCountNumber}>{userCount}</span>
            {userCountUpdating && <span style={styles.pulse}>●</span>}
          </div>
          <p style={styles.updateIndicator}>Updates every 3 seconds</p>
        </div>

        <div style={styles.card}>
          <input type="file" onChange={e=>setFile(e.target.files[0])}/>
          <button onClick={analyze} style={styles.button}>
            Generate Report
          </button>
          {loading && <p>Processing...</p>}
        </div>


        {stats &&
        <div style={styles.card}>

          <h3>Analytics</h3>

          <BarChart width={500} height={300} data={[
            {name:"Reports",value:stats.reports},
            {name:"Users",value:stats.users},
            {name:"Usage",value:stats.usage}
          ]}>
            <XAxis dataKey="name"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="value"/>
          </BarChart>

        </div>
        }

      </div>
    </div>
  )
}


///////////////////////////////////////////////////////////
// STYLES
///////////////////////////////////////////////////////////

const styles = {

  center:{
    height:"100vh",
    display:"flex",
    gap:20,
    flexWrap:"wrap",
    justifyContent:"center",
    alignItems:"center",
    background:"#f4f6f8"
  },

  layout:{
    display:"flex",
    height:"100vh",
    fontFamily:"Arial"
  },

  sidebar:{
    width:220,
    background:"#111827",
    color:"white",
    padding:20
  },

  main:{
    flex:1,
    padding:40,
    background:"#f9fafb"
  },

  card:{
    background:"white",
    padding:20,
    borderRadius:10,
    marginBottom:20,
    boxShadow:"0 2px 8px rgba(0,0,0,0.1)"
  },

  input:{
    display:"block",
    marginBottom:10,
    padding:10,
    width:"100%"
  },

  button:{
    padding:"10px 20px",
    background:"#111827",
    color:"white",
    border:"none",
    cursor:"pointer"
  },

  liveUserCard:{
    background:"linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color:"white",
    padding:30,
    borderRadius:10,
    marginBottom:20,
    boxShadow:"0 4px 12px rgba(102, 126, 234, 0.4)"
  },

  userCountDisplay:{
    display:"flex",
    alignItems:"center",
    gap:15,
    marginTop:15,
    marginBottom:15
  },

  userCountNumber:{
    fontSize:48,
    fontWeight:"bold",
    fontFamily:"monospace"
  },

  pulse:{
    color:"#4ade80",
    fontSize:24,
    animation:"pulse 1.5s infinite"
  },

  updateIndicator:{
    fontSize:12,
    opacity:0.8,
    margin:0
  }
}
