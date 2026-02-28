import React,{useState,useEffect} from "react";
import ReactDOM from "react-dom/client";
import {BrowserRouter,Routes,Route,Navigate,useNavigate} from "react-router-dom";

/* ================= CONFIG ================= */

const API="http://127.0.0.1:5000";

/* ================= API ================= */

async function api(url,method="GET",data=null){
    return fetch(API+url,{
        method,
        headers:{
            "Content-Type":"application/json",
            "Authorization":localStorage.getItem("token")
        },
        body:data?JSON.stringify(data):null
    }).then(r=>r.json());
}

/* ================= PROTECTED ROUTE ================= */

function Protected({children,roles}){
    const token=localStorage.getItem("token");
    const role=localStorage.getItem("role");

    if(!token) return <Navigate to="/login"/>;
    if(roles && !roles.includes(role)) return <Navigate to="/login"/>;
    return children;
}

/* ================= NAVBAR ================= */

function Navbar(){

    function go(path){
        window.location.href=path;
    }

    function logout(){
        localStorage.clear();
        window.location="/login";
    }

    return(
        <div style={{background:"#111",padding:10}}>
            <button onClick={()=>go("/dashboard")}>Dashboard</button>
            <button onClick={()=>go("/booking")}>Booking</button>
            <button onClick={()=>go("/admin")}>Admin</button>
            <button onClick={()=>go("/users")}>Users</button>
            <button onClick={logout}>Logout</button>
        </div>
    );
}

/* ================= LOGIN ================= */

function Login(){

    const nav=useNavigate();
    const[u,setU]=useState("");
    const[p,setP]=useState("");

    async function login(){

        let r=await api("/login","POST",{username:u,password:p});

        if(r.token){
            localStorage.setItem("token",r.token);
            localStorage.setItem("role",r.role);

            if(r.role==="admin") nav("/admin");
            else if(r.role==="staff") nav("/dashboard");
            else nav("/booking");
        }
        else alert("Invalid login");
    }

    return(
        <div style={{marginTop:100,textAlign:"center"}}>
            <h2>Login</h2>

            <input placeholder="username" onChange={e=>setU(e.target.value)}/>
            <br/>
            <input type="password" placeholder="password" onChange={e=>setP(e.target.value)}/>
            <br/><br/>

            <button onClick={login}>Login</button>
        </div>
    );
}

/* ================= DASHBOARD ================= */

function Dashboard(){

    const[s,setS]=useState({});

    useEffect(()=>{
        api("/stats").then(setS);
    },[]);

    return(
        <div style={{display:"flex",gap:20,justifyContent:"center",marginTop:40}}>

            <Card title="Total Rooms" value={s.total_rooms}/>
            <Card title="Occupied" value={s.occupied}/>
            <Card title="Available" value={s.available}/>

        </div>
    );
}

function Card({title,value}){
    return(
        <div style={{
            background:"white",
            padding:20,
            borderRadius:12,
            boxShadow:"0 3px 10px rgba(0,0,0,.2)"
        }}>
            <h3>{title}</h3>
            <h2>{value}</h2>
        </div>
    );
}

/* ================= ADMIN ================= */

function Admin(){

    const[n,setN]=useState("");
    const[t,setT]=useState("");
    const[p,setP]=useState("");

    async function add(){
        await api("/rooms","POST",{number:n,type:t,price:p});
        alert("Room Added");
    }

    return(
        <div style={{textAlign:"center"}}>
            <h2>Add Room</h2>

            <input placeholder="Number" onChange={e=>setN(e.target.value)}/>
            <br/>
            <input placeholder="Type" onChange={e=>setT(e.target.value)}/>
            <br/>
            <input placeholder="Price" onChange={e=>setP(e.target.value)}/>
            <br/><br/>

            <button onClick={add}>Save</button>
        </div>
    );
}

/* ================= BOOKING ================= */

function Booking(){

    const[g,setG]=useState("");
    const[r,setR]=useState("");
    const[ci,setCi]=useState("");
    const[co,setCo]=useState("");

    async function book(){
        await api("/book","POST",{guest_id:g,room_id:r,check_in:ci,check_out:co});
        alert("Booked!");
    }

    return(
        <div style={{textAlign:"center"}}>
            <h2>Book Room</h2>

            <input placeholder="Guest ID" onChange={e=>setG(e.target.value)}/>
            <br/>
            <input placeholder="Room ID" onChange={e=>setR(e.target.value)}/>
            <br/>
            <input placeholder="Check In" onChange={e=>setCi(e.target.value)}/>
            <br/>
            <input placeholder="Check Out" onChange={e=>setCo(e.target.value)}/>
            <br/><br/>

            <button onClick={book}>Book</button>
        </div>
    );
}

/* ================= USERS ================= */

function Users(){

    const[u,setU]=useState("");
    const[p,setP]=useState("");
    const[r,setR]=useState("staff");

    async function create(){
        await api("/create-user",{username:u,password:p,role:r});
        alert("User created");
    }

    return(
        <div style={{textAlign:"center"}}>
            <h2>Create User</h2>

            <input placeholder="Username" onChange={e=>setU(e.target.value)}/>
            <br/>
            <input placeholder="Password" onChange={e=>setP(e.target.value)}/>
            <br/>

            <select onChange={e=>setR(e.target.value)}>
                <option>staff</option>
                <option>guest</option>
                <option>admin</option>
            </select>

            <br/><br/>
            <button onClick={create}>Create</button>
        </div>
    );
}

/* ================= APP ================= */

function App(){
    return(
        <BrowserRouter>

            <Navbar/>

            <Routes>

                <Route path="/login" element={<Login/>}/>

                <Route path="/dashboard" element={
                    <Protected roles={["admin","staff"]}>
                        <Dashboard/>
                    </Protected>
                }/>

                <Route path="/admin" element={
                    <Protected roles={["admin"]}>
                        <Admin/>
                    </Protected>
                }/>

                <Route path="/booking" element={
                    <Protected roles={["admin","guest"]}>
                        <Booking/>
                    </Protected>
                }/>

                <Route path="/users" element={
                    <Protected roles={["admin"]}>
                        <Users/>
                    </Protected>
                }/>

                <Route path="*" element={<Navigate to="/login"/>}/>

            </Routes>

        </BrowserRouter>
    );
}

/* ================= RENDER ================= */

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);