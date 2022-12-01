//LIBRARY TO READ FILES
import { debug } from 'console';
import * as fs from 'fs/promises';

main();
//POST EACH HOUR
setInterval(main, 1000 * 60 * 60);


//RETRIEVES THE LAST REDDIT POSTS IN R/AMITHEASSHOLE AND CHECKS IF IT'S ALREADY UPLOADED TO MASTODON
//IF IT'S NOT, WILL PUBLISH A THREAD WITH THE CONTENT OF THE LATEST POST AND WILL ADD A POLL AT THE END
async function main() {
    try {
        console.log(Date() + "\nPrograma inicia\n\n");
        let mids = await getPostId();
        console.log(Date() + "\nPost_id leido y mapa incializado\n\n");
        debugger;
        let accTokenReddit = await redditToken();
        console.log(Date() + "\nToken Reddit recibido\n\n");
        debugger;
        let latestReddditPostArr = await latestRedditPosts(accTokenReddit);
        console.log(Date() + "\nCogidos los últimos post de reddit hot\n\n");
        debugger;
        let postToUse = chooseRedditPost(latestReddditPostArr, mids);
        console.log(Date() + "\nElegido post para publicar\n\n");
        debugger;
        if(postToUse.id !== null){
            await postStates(postToUse);
            console.log(Date() + "\nPost publicado en mastodon\n\n");
            debugger;
            updateMap(mids);
            console.log(Date() + "\nMapa actualizado\n\n");
            debugger;
            await updatePostId(mids, postToUse);
            console.log(Date() + "\nPost_id.txt actualizado con el nuevo mapa\n\n");
            debugger;
        }
    } catch (error) {
        console.log(Date() + "\n"+error+"\n\n");
    }

}

//Returns a Map with the ids (key) and timestamps (value) of use of the posts in post_id
async function getPostId() {

    let mids = new Map();
    let ids = await fs.readFile("./post_id.txt", { encoding: "utf8" });
    //FORMATO POST_ID.TXT
    /*
        pid_1, timestamp_of_use_1
        pid_2, timestamp_of_use_2
        ...
        pid_n, timestamp_of_use_n
    */
    ids = ids.split("\n");
    ids.forEach(e => {
        if(e !== ""){
            let el = e.split(",");
            //pid_n, tou_n
            mids.set(el[0], el[1]);
        }
    })
    return mids;
}

//Update post_id.txt with the new map AND ADDS NEW POST
async function updatePostId(mids, post){
    let str = "";
    mids.forEach((v, k) => {
        str+= k+","+v+"\n";
    });
    str += post.id + "," + Date.now();
    console.log(Date()+"\nContenido Mapa:\n-----------------\n"+str+"\n\n");
   await fs.writeFile("./post_id.txt", str, { encoding: "utf8" });
}

//RETURNS A NEW ACCESS TOKEN
async function redditToken() {
    //IT READS THE CLIENT ID AND THE SECRET
    let rid = await fs.readFile("./reddit_id.txt", { encoding: "utf8" });
    let rsecret = await fs.readFile("./reddit_secret.txt", { encoding: "utf8" });
    //BEARER TOKEN REQUEST
    let id = "Basic " + btoa(rid + ":" + rsecret);
    const data = await fetch('https://www.reddit.com/api/v1/access_token',
        {
            body: "grant_type=client_credentials",
            headers: { Authorization: id, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    const obj = await data.json();
    /*
    {
    "access_token": Your access token,
    "token_type": "bearer",
    "expires_in": Unix Epoch Seconds,
    "scope": A scope string,
    }
    */
    return obj.access_token;
}

//RETURN 5 TOP REDDIT POSTS
async function latestRedditPosts(token) {

    const options = {
        method: 'GET',
        headers: { Authorization: "bearer " + token }
    };
    let post = null;
    let data = await fetch('https://oauth.reddit.com/r/AmItheAsshole/hot?limit=5', options);
    post = await data.json();

    return post.data.children;
}

//RETURNS THE RELEVANT POST
//IF THERE IS NO NEW POST RETURNS A POST WITH id = null 
function chooseRedditPost(latestReddditPostArr, mids) {
    var found = false;
    var i = 0;
    var post = { id: null };
    while (!found && i < latestReddditPostArr.length) {
        let tpost = relevantPost(latestReddditPostArr[i]);
        if(!mids.has(tpost.id)){
            found = true;
            post = tpost;
        }
        i++;
    }
    return post;
}

/*EXTRACT RELEVANT INFORMATION ABOUT THE POST IN THE FOLLOWING FORMAT
    {
        title: "title",
        text: "text",
        url: "url",
        id: "id"
    }
*/
function relevantPost(post) {
    let postInfo = post.data;
    let relPostInfo = {
        title: postInfo.title,
        text: postInfo.selftext,
        url: postInfo.url,
        id: "t3_" + postInfo.id
    }
    return relPostInfo;
}

/*POST STATES AS A THREAD*/
async function postStates(info) {

    let token = await fs.readFile("./mastodon_token.txt", { encoding: "utf8" });

    //PRIMER TOOT CON EL TITULO
    let params = new URLSearchParams();
    params.set("status", info.title + "\n\n" + info.url + "\n\n\n#AITA #AmITheAsshole #Bot #Bots #Reddit");
    params.set("media_ids[]", []);

    let data = await fetch('https://botsin.space/api/v1/statuses',
        {
            body: params.toString(),
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    let obj = await data.json();
    let lastId = obj.id;

    //PIN FIRST TOOT
    data = await fetch("https://botsin.space/api/v1/statuses/" + lastId + "/pin",
        {
            headers: { Authorization: "Bearer " + token },
            method: "POST"
        });

    //SIGUIENTES TOOTS CON TODO EL TEXTO
    let txt = info.text;
    let prgrph = txt.split("\n");
    for (let npr = 0; npr < prgrph.length; npr++) {
        let pr = prgrph[npr];
        if (pr !== "" && pr !== " ") {
            //Split paragraph in words
            let words = pr.split(" ");
            let tootContent = "";
            for (let nw = 0; nw < words.length; nw++) {
                let cword = words[nw];
                if ((tootContent.length + cword.length + 1) <= 500) {
                    //If adding a new word will fit, we add it to cword
                    tootContent += tootContent.length == 0 ? cword : (" " + cword);
                } else {
                    //If adding a new word wont fit we send the current toot
                    let params = new URLSearchParams();
                    params.set("status", tootContent);
                    params.set("media_ids[]", []);
                    params.set("visibility", "unlisted");
                    params.set("in_reply_to_id", lastId);
                    let data = await fetch('https://botsin.space/api/v1/statuses',
                        {
                            body: params.toString(),
                            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
                            method: "POST"
                        });
                    let obj = await data.json();
                    lastId = obj.id;

                    //And set the new value to tootContent
                    tootContent = cword;
                }
            }

            //If tootContent has something in it we have to publish it
            if (tootContent.length > 0) {
                let params = new URLSearchParams();
                params.set("status", tootContent);
                params.set("media_ids[]", []);
                params.set("visibility", "unlisted");
                params.set("in_reply_to_id", lastId);
                let data = await fetch('https://botsin.space/api/v1/statuses',
                    {
                        body: params.toString(),
                        headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
                        method: "POST"
                    });
                let obj = await data.json();
                lastId = obj.id;
            }
        }
    }


    //ENCUESTA
    params = new URLSearchParams();
    params.set("status", "Am I The Asshole?");
    params.append("poll[options][]", "YTA - YOU THE ASSHOLE");
    params.append("poll[options][]", "NTA - NOT THE ASSHOLE");
    params.append("poll[options][]", "ESH - EVERYONE SUCKS HERE");
    params.append("poll[options][]", "NAH - NO ASSHOLES HERE");
    params.set("poll[expires_in]", 604800);
    params.set("visibility", "unlisted");
    params.set("in_reply_to_id", lastId);
    data = await fetch('https://botsin.space/api/v1/statuses',
        {
            body: params.toString(),
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    obj = await data.json();
    lastId = obj.id;
}

//DELETES ANY POST OLDER THAN 7 DAYS
function updateMap(mids, post){
    let keys = mids.keys();
    let now = Date.now();
    for(const id of keys){
        let timeused = mids.get(id);

        //IF IT WAS TOOTED MORE THAN A WEEK AGO WE DELETE IT
        if(timeused + (1000*60*60*24*7) <= now){
            mids.delete(id);
        }
    }
}