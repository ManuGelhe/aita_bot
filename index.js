//LIBRARY TO READ FILES
import { debug } from 'console';
import * as fs from 'fs/promises';


let lastUsedId = "";

main();


//RETRIEVES THE LAST REDDIT POST IN R/AMITHEASSHOLE AND CHECKS IF IT'S ALREADY UPLOADED TO MASTODON
//IF IT'S NOT, WILL PUBLISH A THREAD WITH THE CONTENT OF THE LATEST POST AND WILL ADD A POLL AT THE END
async function main() {
    let accTokenReddit = await redditToken();
    let latestReddditPost = await latestRedditPost(accTokenReddit);
    let relevantPostInfo = relevantPost(latestReddditPost);

    if (relevantPostInfo.id !== lastUsedId) {
        //TODO MASTODON POST TWEETS
        postStates(relevantPostInfo);
        //CHANGE LAST USED ID TO THE NEW POST ID
        lastUsedId = relevantPostInfo.id;
    }
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
    console.log(obj);
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

//RETURN LATEST REDDIT POST
async function latestRedditPost(token) {

    const options = {
        method: 'GET',
        headers: { Authorization: "bearer " + token }
    };

    let data = await fetch('https://oauth.reddit.com/r/AmItheAsshole/new?limit=1', options);
    let post = await data.json();
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
    let postInfo = post.data.children[0].data;
    let relPostInfo = {
        title: postInfo.title,
        text: postInfo.selftext,
        url: postInfo.url,
        id: postInfo.id
    }
    return relPostInfo;
}

/*POST STATES AS A THREAD*/
async function postStates(info) {

    let token = await fs.readFile("./mastodon_token.txt", { encoding: "utf8" });

    //PRIMER TOOT CON EL TITULO
    let params = new URLSearchParams();
    params.set("status", info.title + "\n\n"+info.url+"\n\n\n#AITA #AmITheAsshole #Bot #Bots #Reddit");
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
    data = await fetch("https://botsin.space/api/v1/statuses/"+lastId+"/pin",
        {
            headers: {Authorization: "Bearer "+ token},
            method: "POST"
        });
    //SIGUIENTES TOOTS CON TODO EL TEXTO



    //ENCUESTA
    params = new URLSearchParams();
    params.set("status", "This is the real poll test and an answer!!");
    params.append("poll[options][]", "YTA - YOU THE ASSHOLE");
    params.append("poll[options][]", "NTA - NOT THE ASSHOLE");
    params.append("poll[options][]", "ESH - EVERYONE SUCKS HERE");
    params.append("poll[options][]", "NAH - NO ASSHOLES HERE");
    params.set("poll[expires_in]", 604800);
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