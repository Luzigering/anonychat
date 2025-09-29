import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
    serverTimestamp, doc, getDoc, setDoc, where, getDocs, writeBatch 
} from 'firebase/firestore';


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


const generateFriendCode = () => {
    const words = ['FLOR', 'SOL', 'LUA', 'RIO', 'MAR', 'ESTRELA', 'CASA', 'LUZ'];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${randomWord}-${randomNumber}`;
};

// Componentes da UI 

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center bg-white">
        <svg className="w-16 h-16 text-green-500 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.99988V5.99988M12 18.0001V21.0001M21 12.0001H18M6 12.0001H3M18.36 5.64014L16.24 7.76014M7.75998 16.2401L5.63998 18.3601M18.36 18.3601L16.24 16.2401M7.75998 7.76014L5.63998 5.64014" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
        <h1 className="text-3xl font-bold mt-4 text-slate-800">Conectando...</h1>
        <p className="text-slate-500 mt-2 max-w-md">A inicializar o protocolo de segurança e a sua identidade.</p>
    </div>
);

const AddFriendModal = ({ onClose, onAddFriend, currentUserCode }) => {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsAdding(true);
        const friendCode = code.trim().toUpperCase();
        if (!friendCode) return;

        if (friendCode === currentUserCode) {
            setError('Não pode adicionar a si mesmo.');
            setIsAdding(false);
            return;
        }
        
        try {
            await onAddFriend(friendCode);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                <h3 className="text-lg font-bold mb-4">Adicionar Amigo</h3>
                <p className="text-sm text-slate-500 mb-4">Insira o Código de Amigo da pessoa que quer adicionar.</p>
                <form onSubmit={handleSubmit}>
                    <input type="text" placeholder="EX: LUA-123" className="w-full px-3 py-2 border border-slate-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 uppercase" value={code} onChange={(e) => setCode(e.target.value)} required />
                    {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
                    <div className="flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md hover:bg-slate-300">Cancelar</button>
                        <button type="submit" disabled={isAdding} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-green-300">{isAdding ? 'A adicionar...' : 'Adicionar'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ContactList = ({ contacts, onSelectContact, activeContactId }) => (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {contacts.length === 0 && <p className="p-4 text-center text-sm text-slate-400">Adicione amigos para começar a conversar!</p>}
        {contacts.map(contact => (
            <div key={contact.id} onClick={() => onSelectContact(contact)} className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors duration-200 ${activeContactId === contact.id ? 'bg-green-100' : 'hover:bg-slate-100'}`}>
                <img className="w-12 h-12 rounded-full flex-shrink-0" src={`https://placehold.co/100x100/10B981/FFFFFF?text=${contact.displayName.charAt(0)}`} alt="Avatar" />
                <div className="flex-1 ml-4 overflow-hidden">
                    <p className={`font-bold ${activeContactId === contact.id ? 'text-green-800' : 'text-slate-800'}`}>{contact.displayName}</p>
                    <p className="text-sm text-slate-500 truncate">Clique para conversar</p>
                </div>
            </div>
        ))}
    </div>
);

const ChatWindow = ({ contact, userId, onBack }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!contact?.roomId) {
            setMessages([]);
            return;
        };

        const messagesRef = collection(db, 'rooms', contact.roomId, 'messages');
        const q = query(messagesRef, orderBy('createdAt'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(fetchedMessages);
        }, (error) => console.error("Erro ao buscar mensagens: ", error));

        return () => unsubscribe();
    }, [contact?.roomId]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        const text = newMessage.trim();
        if (text && contact?.roomId) {
            const encryptedText = `encrypted:${btoa(unescape(encodeURIComponent(text)))}`;
            setNewMessage('');
            await addDoc(collection(db, 'rooms', contact.roomId, 'messages'), { text: encryptedText, uid: userId, createdAt: serverTimestamp() });
        }
    };
    
    const decrypt = (text) => {
        if (!text?.startsWith("encrypted:")) return text;
        try { return decodeURIComponent(escape(atob(text.substring(10)))); } 
        catch { return "🔒 Mensagem danificada"; }
    };

    if (!contact) {
        return (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-center p-4 bg-slate-100">
                <svg className="w-24 h-24 text-slate-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                <h2 className="mt-4 text-2xl font-bold text-slate-600">Selecione uma conversa</h2>
                <p className="text-slate-500">As suas mensagens seguras aparecerão aqui.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col bg-slate-100 h-full w-full">
            <header className="p-4 border-b border-slate-200 flex items-center bg-white flex-shrink-0 shadow-sm">
                <button onClick={onBack} className="md:hidden p-2 mr-2 rounded-full hover:bg-slate-200">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </button>
                <img className="w-10 h-10 rounded-full mr-4" src={`https://placehold.co/100x100/10B981/FFFFFF?text=${contact.displayName.charAt(0)}`} alt="Avatar" />
                <h2 className="text-lg font-bold">{contact.displayName}</h2>
            </header>
            <main className="flex-1 p-6 overflow-y-auto pb-24 md:pb-6">
                {messages.map(msg => {
                    const isSentByUser = msg.uid === userId;
                    const timestamp = msg.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '';
                    return (
                        <div key={msg.id} className={`flex mb-3 ${isSentByUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl shadow-sm ${isSentByUser ? 'bg-green-500 text-white rounded-br-lg' : 'bg-white text-slate-800 rounded-bl-lg'}`}>
                                <p className="text-sm break-words">{decrypt(msg.text)}</p>
                                <p className={`text-xs mt-1 text-right ${isSentByUser ? 'text-green-100/70' : 'text-slate-400'}`}>{timestamp}</p>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </main>
            <footer className="p-4 bg-white border-t border-slate-200">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-4">
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Escreva uma mensagem..." autoComplete="off" className="w-full py-3 px-4 bg-slate-100 rounded-full focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <button type="submit" className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-transform active:scale-95">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                </form>
            </footer>
        </div>
    );
};

const ProfileView = ({ userProfile, onAddFriendClick, onCopyCode }) => (
    <div className="flex flex-col h-full w-full p-4">
         <h2 className="text-xl font-bold mb-6">Meu Perfil</h2>
         <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
             <p className="text-sm text-slate-500 mb-1 font-semibold">Seu Código de Amigo:</p>
             <div className="flex items-center bg-white border border-slate-200 rounded-lg p-2">
                <span className="font-mono text-green-700 text-sm w-full">{userProfile.friendCode}</span>
                <button onClick={onCopyCode} className="ml-2 p-2 rounded-md hover:bg-slate-100 transition-colors">
                    <svg className="w-4 h-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                </button>
             </div>
             <p className="text-xs text-slate-400 mt-2">Partilhe este código para que outros o possam adicionar.</p>
         </div>
         <button onClick={onAddFriendClick} className="mt-6 w-full flex items-center justify-center p-3 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600">
             <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
             Adicionar Amigo
         </button>
    </div>
);

export default function App() {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [activeContact, setActiveContact] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [setView] = useState('contacts');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists()) {
                    const friendCode = generateFriendCode();
                    const newUserProfile = { friendCode, displayName: `Utilizador-${friendCode.split('-')[1]}` };
                    await setDoc(userDocRef, newUserProfile);
                    setUserProfile(newUserProfile);
                } else {
                    setUserProfile(userDoc.data());
                }
            } else {
                signInAnonymously(auth).catch(e => console.error("Login anónimo falhou", e));
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => { if (userProfile) setIsLoading(false) }, [userProfile]);

    useEffect(() => {
        if (!user) return;
        const contactsRef = collection(db, 'users', user.uid, 'contacts');
        const unsubscribe = onSnapshot(contactsRef, (snapshot) => {
            const userContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setContacts(userContacts);
        });
        return () => unsubscribe();
    }, [user]);

    const handleAddFriend = useCallback(async (friendCode) => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('friendCode', '==', friendCode));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) throw new Error('Código de Amigo não encontrado.');

        const friendDoc = querySnapshot.docs[0];
        const friendId = friendDoc.id;
        if (friendId === user.uid) throw new Error('Não pode adicionar a si mesmo.');
        
        const friendData = friendDoc.data();
        const newRoomRef = doc(collection(db, 'rooms'));
        const batch = writeBatch(db);

batch.set(newRoomRef, {
    participants: [user.uid, friendId],
    createdAt: serverTimestamp() 
});


batch.set(doc(db, 'users', user.uid, 'contacts', friendId), { displayName: friendData.displayName, roomId: newRoomRef.id });
// ...
        batch.set(doc(db, 'users', user.uid, 'contacts', friendId), { displayName: friendData.displayName, roomId: newRoomRef.id });
        batch.set(doc(db, 'users', friendId, 'contacts', user.uid), { displayName: userProfile.displayName, roomId: newRoomRef.id });
        await batch.commit();
    }, [user, userProfile]);
    
    const handleCopyCode = () => {
        if (!userProfile?.friendCode) return;
        navigator.clipboard.writeText(userProfile.friendCode);
    };

    const handleSelectContact = (contact) => {
        setActiveContact(contact);
        setView('chat');
    };

    if (isLoading) return <div className="w-full h-screen flex"><LoadingScreen /></div>;

    return (
        <div className="w-full h-screen flex bg-white overflow-hidden">
            {isModalOpen && <AddFriendModal onClose={() => setIsModalOpen(false)} onAddFriend={handleAddFriend} currentUserCode={userProfile?.friendCode} />}
            
            <nav className="hidden md:flex w-20 bg-slate-800 flex-col items-center py-6 space-y-6 flex-shrink-0">
                <div className="p-3 bg-green-500 rounded-xl text-white"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.002 3.002 0 01-3.71-3.71A3 3 0 017 10h10a3 3 0 013 3 3 3 0 01-3 3m-3.71-3.71a3 3 0 00-3.58 0M12 6a3 3 0 110-6 3 3 0 010 6z"></path></svg></div>
            </nav>

            <aside className={`${activeContact ? 'hidden' : 'flex'} md:flex w-full md:w-1/3 lg:w-1/4 bg-white border-r border-slate-200 flex-col`}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Amigos</h2><button onClick={() => setIsModalOpen(true)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg></button></div></header>
                <ContactList contacts={contacts} onSelectContact={handleSelectContact} activeContactId={activeContact?.id} />
                {}
                {userProfile && (
                    <footer className="p-4 border-t border-slate-200 bg-slate-50">
                        <p className="text-sm text-slate-500 mb-1 font-semibold">Seu Código de Amigo:</p>
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-2"><span className="font-mono text-green-700 text-sm w-full">{userProfile.friendCode}</span><button onClick={handleCopyCode} className="ml-2 p-2 rounded-md hover:bg-slate-100 transition-colors"><svg className="w-4 h-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></button></div>
                    </footer>
                )}
            </aside>
            
            <main className={`${activeContact ? 'flex' : 'hidden'} md:flex flex-1 flex-col`}> 
                <ChatWindow contact={activeContact} userId={user?.uid} onBack={() => setActiveContact(null)} />
            </main>

        </div>
    );
}

